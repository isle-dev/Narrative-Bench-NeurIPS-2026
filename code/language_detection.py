"""Detect the language of model responses."""
import json,re,collections,hashlib
from pathlib import Path

FALLBACK_LANGUAGES={'am','ti','ne','prs'}
LID_CODES={'amh_Ethi':'am','tir_Ethi':'ti','npi_Deva':'ne','prs_Arab':'prs','pes_Arab':'fa',
 'eng_Latn':'en','fra_Latn':'fr','hin_Deva':'hi','arb_Arab':'ar','ary_Arab':'ar','arz_Arab':'ar',
 'deu_Latn':'de','rus_Cyrl':'ru','ukr_Cyrl':'uk','zho_Hans':'zh','zho_Hant':'zh','yue_Hant':'zh',
 'urd_Arab':'ur','heb_Hebr':'he','ben_Beng':'bn','hye_Armn':'hy','azj_Latn':'az',
 'spa_Latn':'es','por_Latn':'pt','pol_Latn':'pl','tam_Taml':'ta','tha_Thai':'th','tur_Latn':'tr'}

class FastTextFallback:
    def __init__(self,path,manifest):
        config=json.loads(Path(manifest).read_text());path=Path(path)
        for key in ['probability_threshold','margin_threshold']:
            value=config[key]
            if type(value) not in {int,float} or not 0<=value<=1:raise ValueError('invalid language threshold: '+key)
        h=hashlib.sha256()
        with path.open('rb') as f:
            for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
        if h.hexdigest()!=config['sha256']:raise ValueError('language model checksum mismatch')
        import fasttext
        self.model=fasttext.load_model(str(path));self.metadata=config
        required={'__label__amh_Ethi','__label__tir_Ethi','__label__npi_Deva','__label__prs_Arab','__label__pes_Arab'}
        if not required<=set(self.model.get_labels()):raise ValueError('language model lacks required classes')
    def candidates(self,text):

        result=self.model.f.predict(text.replace('\n',' ')+'\n',10,0.0,'strict')
        return [(label.removeprefix('__label__'),float(prob)) for prob,label in result]

def fallback_classify(backend,text,query):
    details=[];codes=[];uncertain=False
    for start in range(0,len(text),800):
        chunk=text[start:start+800]
        if sum(c.isalpha() for c in chunk)<20:continue
        candidates=backend.candidates(chunk);mass=collections.Counter()
        for label,p in candidates:
            code=LID_CODES.get(label,label)

            if query=='prs' and code=='fa':code='prs'
            mass[code]+=p
        ranked=mass.most_common();code,p=ranked[0] if ranked else (None,0.);p=min(p,1.)
        second=ranked[1][1] if len(ranked)>1 else 0.
        reliable=(p>=backend.metadata.get('probability_threshold',.80) and
                  p-second>=backend.metadata.get('margin_threshold',.20))
        details.append(dict(detected=code,confidence=p,margin=p-second,reliable=reliable,candidates=candidates))
        if reliable:codes.append(code)
        else:uncertain=True
    status=('same' if uncertain or not codes else 'mixed' if len(set(codes))>1 else 'same' if codes[0]==query else 'different')
    return status,dict(backend='fasttext_lid218',windows=details)
def clean(s):
    s=re.sub(r'<think>[\s\S]*?</think>',' ',s,flags=re.I)
    s=re.sub(r'```[\s\S]*?```',' ',s);s=re.sub(r'^\s*>.*$',' ',s,flags=re.M)
    s=re.sub(r'https?://\S+',' ',s)

    s=re.sub(r'(?<![A-Za-z0-9_])D\d{4,}(?![A-Za-z0-9_])',' ',s)
    return re.sub(r'\s+',' ',s).strip()
def classify(detector,text,query,fallback=None):
    s=clean(text)
    if not any(c.isalnum() for c in s):return 'no_answer',{'reason':'no prose'}
    if query in FALLBACK_LANGUAGES and fallback is None:
        raise ValueError('provide the pinned fastText fallback model for Amharic, Tigrinya, Nepali or Dari')
    if query in FALLBACK_LANGUAGES and fallback is not None:
        if sum(c.isalpha() for c in s)<20:return 'same',{'reason':'insufficient language evidence'}
        return fallback_classify(fallback,s,query)
    if sum(c.isalpha() for c in s)<40:return 'same',{'reason':'insufficient language evidence'}
    codes=[];uncertain=False;details=[]
    for start in range(0,len(s),800):
        chunk=s[start:start+800]
        if sum(c.isalpha() for c in chunk)<40:continue
        v=detector.compute_language_confidence_values(chunk)
        if not v:uncertain=True;continue
        first=v[0];second=v[1].value if len(v)>1 else 0;code=first.language.iso_code_639_1.name.lower()
        han=sum('\u3400'<=c<='\u9fff' for c in chunk);kana=sum('\u3040'<=c<='\u30ff' for c in chunk);letters=sum(c.isalpha() for c in chunk)
        if code=='ja' and han/max(letters,1)>=.6 and kana/max(letters,1)<.05:code='zh'
        reliable=first.value>=.7 and first.value-second>=.15

        if ((query=='uk' and code in {'kk','ru','be'}) or
                (query=='hi' and code in {'mr','ne'}) or
                (query=='zh' and code=='en' and han/max(letters,1)>.1)):
            reliable=False
        if not reliable:uncertain=True
        else:codes.append(code)
        details.append({'detected':code,'confidence':first.value,'margin':first.value-second,'reliable':reliable})
    if uncertain or not codes:return 'same',{'windows':details}
    if len(set(codes))>1:return 'mixed',{'windows':details}
    return ('same' if codes[0]==query else 'different'),{'windows':details}
