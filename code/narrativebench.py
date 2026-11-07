"""Load NarrativeBench, prepare model inputs, and reproduce citation-based scores."""
from __future__ import annotations
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import sys

TASKS = ('NI','NE','MNI','BP','DP')
LANGUAGE_STATUSES = {'same','different','mixed','no_answer','unknown'}

def text_sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def file_sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def digest(value):
    return text_sha(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False))

def read_jsonl(path):
    with Path(path).open(encoding='utf-8') as stream:
        for line in stream:
            if line.strip():yield json.loads(line)

def write_jsonl(path,rows):
    with Path(path).open('w',encoding='utf-8') as stream:
        for row in rows:stream.write(json.dumps(row,ensure_ascii=False,allow_nan=False)+'\n')

def parquet_rows(path):
    import pyarrow.parquet as pq
    for batch in pq.ParquetFile(path).iter_batches(batch_size=512):
        yield from batch.to_pylist()

def verify_files(root):
    root=Path(root).resolve()
    manifest=json.loads((root/'manifest.json').read_text())
    for name,expected in manifest['files'].items():
        p=(root/name).resolve()
        if not p.is_relative_to(root) or not p.is_file() or file_sha(p)!=expected:
            raise ValueError('release file does not match manifest: '+name)
    return manifest

def load_data(root):
    root=Path(root)
    docs={r['document_id']:r for r in parquet_rows(root/'data/documents.parquet')}
    cases={r['case_id']:r for r in parquet_rows(root/'data/evaluation.parquet')}
    return docs,cases

def messages(case,documents):
    parts=['DOCUMENTS:']
    for did in case['document_ids']:
        d=documents[did]
        parts.append(f"[{did}]\nSource: {d['url']}\n{d['text']}")
    body='\n\n---\n'.join(parts)
    if case.get('query_context'):body+='\n\n'+case['query_context']
    result=[{'role':'system','content':case['system_instruction']},
            {'role':'user','content':body+'\n\nQUESTION:\n'+case['query']}]
    if case['task']=='MNI':
        if not case.get('prior_answer') or not case.get('followup_instruction'):
            raise ValueError('missing fixed prior answer or follow-up instruction')
        result.extend([{'role':'assistant','content':case['prior_answer']},
                       {'role':'user','content':case['followup_instruction']}])
    return result

def validate_case(case,documents):
    if case['task'] not in TASKS:raise ValueError('unknown task')
    ids=case['document_ids']
    if not ids or len(ids)!=len(set(ids)) or not set(ids)<=set(documents):
        raise ValueError('invalid document context')
    group=case.get('target_narrative_id')
    target={d for d in ids if documents[d]['narrative_id']==group}
    expected=target if case['task']=='NI' else set(ids)-target if case['task'] in {'NE','MNI'} else set(ids)
    if case['task'] in {'NI','NE','MNI'} and not target:raise ValueError('target narrative absent from context')
    if set(case['expected_document_ids'])!=expected:raise ValueError('incorrect narrative targets')
    if case['input_sha256']!=digest(messages(case,documents)):
        raise ValueError('evaluation input has changed: '+case['case_id'])

def score(case,response,language_status,documents):
    if language_status not in LANGUAGE_STATUSES:raise ValueError('unknown response-language label')
    if language_status=='unknown':language_status='same'
    if language_status!='same':return 0.0
    ids=set(re.findall(r'\bD\d{4}\b',response or ''))
    context=set(case['document_ids'])
    expected={documents[d]['narrative_id'] for d in case['expected_document_ids']}
    cited={documents[d]['narrative_id'] for d in ids & context}
    tp=len(cited & expected)
    if case['task'] in {'NI','NE'}:
        fp=len(cited-expected)+len(ids-context)
        fn=len(expected-cited)
        return 2*tp/max(2*tp+fp+fn,1)
    return tp/max(len(expected),1)

def language_for(prediction,label):
    for key in ['case_id','model_id']:
        if prediction[key]!=label[key]:raise ValueError('language label belongs to another response')
    if label['response_sha256']!=text_sha(prediction['response']):
        raise ValueError('response changed after its language assessment')
    if label['language_status'] not in LANGUAGE_STATUSES:raise ValueError('invalid language assessment')
    return label['language_status']

def summarize(rows,cases=None,documents=None):
    values=collections.defaultdict(list);violations=collections.Counter()
    for row in rows:
        if row['score'] is None:raise ValueError('each response requires a numeric score')
        values[(row['model_id'],row['task'])].append(row['score'])
        if row['language_status'] in {'different','mixed'}:violations[row['model_id']]+=1
    models=sorted({m for m,_ in values})
    result={'models':{m:{'tasks':{t:{'mean':sum(values[(m,t)])/len(values[(m,t)]),'cases':len(values[(m,t)])} for t in TASKS if values[(m,t)]},
                         'language_violations':violations[m]} for m in models}}
    if cases is not None and documents is not None:
        def mean(items):return sum(items)/len(items) if items else None
        def disparity(groups,reference):
            if not groups.get(reference):return None
            base=mean(groups[reference]);gaps=[abs(mean(v)-base) for k,v in groups.items() if k!=reference and v]
            return 100*mean(gaps) if gaps else None
        for model in models:
            query=collections.defaultdict(list);target=collections.defaultdict(list);framing=collections.defaultdict(list)
            for row in rows:
                if row['model_id']!=model or row['score'] is None:continue
                case=cases[row['case_id']];value=row['score'];query[case['query_language']].append(value)
                if row['task'] in {'BP','DP'}:framing[case['query_type']].append(value)
                if row['task'] in {'NI','NE'}:
                    languages={documents[d]['publication_language'] for d in case['document_ids'] if documents[d]['narrative_id']==case['target_narrative_id']}
                    if len(languages)!=1:raise ValueError('target narrative has inconsistent publication language')
                    target[next(iter(languages))].append(value)
            tasks=result['models'][model]['tasks']
            result['models'][model]['higher_capabilities']={
                'diversity_prompt_gain_pp':100*(tasks['DP']['mean']-tasks['BP']['mean']) if 'BP' in tasks and 'DP' in tasks else None,
                'confirmatory_absolute_gap_pp':100*abs(mean(framing['neutral'])-mean(framing['confirmatory'])) if framing['neutral'] and framing['confirmatory'] else None,
                'query_language_gap_pp':disparity(query,'en'),
                'target_language_gap_pp':disparity(target,'English')}
        keys=['diversity_prompt_gain_pp','confirmatory_absolute_gap_pp','query_language_gap_pp','target_language_gap_pp']
        result['higher_capabilities']={key:mean([result['models'][m]['higher_capabilities'][key] for m in models if result['models'][m]['higher_capabilities'][key] is not None]) for key in keys}
    return result

def validate(root):
    root=Path(root);manifest=verify_files(root);docs,cases=load_data(root)
    queries=list(parquet_rows(root/'data/queries.parquet'))
    models=json.loads((root/'models.json').read_text())
    counts=manifest['counts']
    for key,n in [('documents',len(docs)),('queries',len(queries)),('evaluation',len(cases)),('model_configurations',len(models))]:
        if n!=counts[key]:raise ValueError('release count mismatch: '+key)
    if len({q['question_id'] for q in queries})!=len(queries):raise ValueError('duplicate query identifier')
    known={q['question_id'] for q in queries}
    for case in cases.values():
        if case['question_id'] not in known:raise ValueError('unknown query identifier')
        validate_case(case,docs)
    opportunities=collections.defaultdict(set)
    for case in cases.values():opportunities[(case['question_id'],case['query_language'])].add(case['task'])
    if any(tasks!=set(TASKS) for tasks in opportunities.values()):raise ValueError('incomplete five-task question/language set')
    return counts|{'input_hashes_verified':len(cases),'network_calls':0}

def provider_payload(conversation,configuration):
    from urllib.parse import quote
    provider=configuration['provider'];model=configuration['api_model'];generation=configuration['generation']
    tokens=generation['max_output_tokens'];temperature=generation.get('temperature',0)
    if provider=='google':
        systems=[m['content'] for m in conversation if m['role'] in {'system','developer'}]
        contents=[{'role':'model' if m['role']=='assistant' else 'user','parts':[{'text':m['content']}]} for m in conversation if m['role'] in {'user','assistant'}]
        config={'temperature':temperature,'maxOutputTokens':tokens}
        if 'thinking_budget' in generation:config['thinkingConfig']={'thinkingBudget':generation['thinking_budget']}
        if 'thinking_level' in generation:config['thinkingConfig']={'thinkingLevel':generation['thinking_level']}
        body={'contents':contents,'generationConfig':config}
        if systems:body['systemInstruction']={'parts':[{'text':'\n\n'.join(systems)}]}
        return {'url':'https://generativelanguage.googleapis.com/v1beta/models/'+quote(model,safe='')+':generateContent','body':body}
    if provider=='openai':
        body={'model':model,'input':conversation,'max_output_tokens':tokens,'reasoning':{'effort':generation.get('reasoning_effort','none')}}
        if temperature is not None:body['temperature']=temperature
        return {'url':'https://api.openai.com/v1/responses','body':body}
    if provider=='moonshot':

        body={'model':model,'messages':conversation,'max_tokens':tokens}
        body.update(configuration['request_options'])
        return {'url':'https://api.moonshot.cn/v1/chat/completions','body':body}
    if provider=='huggingface':
        body={'model':model,'messages':conversation,'temperature':temperature,'max_tokens':tokens,
              'chat_template_kwargs':configuration.get('chat_template_kwargs',{}),'stream':False}
        if 'stop_token_ids' in generation:body['stop_token_ids']=generation['stop_token_ids']
        if 'reasoning_effort' in body['chat_template_kwargs']:body['reasoning_effort']=body['chat_template_kwargs']['reasoning_effort']
        return {'path':'/v1/chat/completions','body':body}
    raise ValueError('unknown model provider')

def export(root,out,model_id,limit=None):
    if limit is not None and limit<1:raise ValueError('--limit must be positive')
    root=Path(root);validate(root);docs,cases=load_data(root)
    models=json.loads((root/'models.json').read_text())
    if model_id not in models:raise ValueError('unknown model configuration')
    selected=list(cases.values())[:limit] if limit else list(cases.values())
    def rows():
        for case in selected:
            conversation=messages(case,docs)
            yield {'case_id':case['case_id'],'model_id':model_id,'messages':conversation,'model_configuration':models[model_id],'provider_request':provider_payload(conversation,models[model_id])}
    write_jsonl(out,rows())
    return {'prepared_cases':len(selected),'model_id':model_id,'network_calls':0}

def replay(root,out=None):
    root=Path(root);validate(root);docs,cases=load_data(root)
    seen=set();scored=[]
    for row in parquet_rows(root/'data/responses.parquet'):
        key=(row['model_id'],row['case_id'])
        if key in seen:raise ValueError('duplicate model/case response')
        seen.add(key)
        status=language_for(row,row)
        case=cases[row['case_id']]
        actual=score(case,row['response'],status,docs)
        if actual is None or abs(actual-row['score'])>1e-12:raise ValueError('score replay mismatch: '+str(key))
        scored.append({'model_id':row['model_id'],'case_id':row['case_id'],'task':case['task'],'language_status':status,'score':actual})
    expected=json.loads((root/'manifest.json').read_text())['counts']['responses']
    model_ids=set(json.loads((root/'models.json').read_text()))
    if len(seen)!=expected or seen!={(m,c) for m in model_ids for c in cases}:raise ValueError('incomplete model/case response set')
    result=summarize(scored,cases,docs)|{'responses_verified':len(seen),'score_mismatches':0,'network_calls':0}
    if out:Path(out).write_text(json.dumps(result,indent=2)+'\n')
    return result

def score_predictions(root,predictions,labels=None,out=None,fallback_model=None):
    if out is None:raise ValueError('provide an output path')
    if labels is None:
        labels=Path(out).with_suffix('.languages.jsonl')
        detect_languages(root,predictions,labels,fallback_model=fallback_model)
    root=Path(root);validate(root);docs,cases=load_data(root)
    language_labels={}
    for label in read_jsonl(labels):
        key=(label['model_id'],label['case_id'])
        if key in language_labels:raise ValueError('duplicate language assessment for model/case')
        language_labels[key]=label
    rows=[];seen=set()
    for pred in read_jsonl(predictions):
        key=(pred['model_id'],pred['case_id'])
        if key in seen:raise ValueError('duplicate model/case response')
        seen.add(key);status=language_for(pred,language_labels[key]);case=cases[pred['case_id']]
        if status=='unknown':status='same'
        rows.append({'model_id':pred['model_id'],'case_id':pred['case_id'],'task':case['task'],'language_status':status,'score':score(case,pred['response'],status,docs)})
    write_jsonl(out,rows)
    return summarize(rows,cases,docs)

def detect_languages(root,predictions,out,fallback_model=None):

    from lingua import LanguageDetectorBuilder
    try:
        from language_detection import classify,FastTextFallback
    except ModuleNotFoundError as exc:
        if exc.name != 'language_detection':raise
        from .public_language import classify,FastTextFallback
    root=Path(root);validate(root);_,cases=load_data(root)
    detector=LanguageDetectorBuilder.from_all_languages().build()
    fallback=FastTextFallback(fallback_model,Path(__file__).with_name('language_detector.json')) if fallback_model else None
    rows=[]
    for pred in read_jsonl(predictions):
        case=cases[pred['case_id']]
        if case['query_language'] in {'am','ti','ne','prs'} and fallback is None:
            raise ValueError('provide --fallback-model for Amharic, Tigrinya, Nepali or Dari responses')
        status,_=classify(detector,pred['response'],case['query_language'],fallback)
        rows.append({'model_id':pred['model_id'],'case_id':pred['case_id'],'response_sha256':text_sha(pred['response']),'language_status':status})
    write_jsonl(out,rows)
    return {'responses':len(rows),'language_statuses':dict(collections.Counter(r['language_status'] for r in rows))}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    for command in ['validate','replay','export','score','detect-language']:
        p=sub.add_parser(command);p.add_argument('--root',type=Path,default=Path(__file__).resolve().parent.parent)
        if command=='export':p.add_argument('--model',required=True);p.add_argument('--limit',type=int);p.add_argument('--out',type=Path,required=True)
        elif command=='replay':p.add_argument('--out',type=Path)
        elif command=='score':p.add_argument('--predictions',type=Path,required=True);p.add_argument('--language-labels',type=Path);p.add_argument('--fallback-model',type=Path);p.add_argument('--out',type=Path,required=True)
        elif command=='detect-language':p.add_argument('--predictions',type=Path,required=True);p.add_argument('--fallback-model',type=Path);p.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    if args.command=='validate':result=validate(args.root)
    elif args.command=='replay':result=replay(args.root,args.out)
    elif args.command=='export':result=export(args.root,args.out,args.model,args.limit)
    elif args.command=='score':result=score_predictions(args.root,args.predictions,args.language_labels,args.out,args.fallback_model)
    else:result=detect_languages(args.root,args.predictions,args.out,args.fallback_model)
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
