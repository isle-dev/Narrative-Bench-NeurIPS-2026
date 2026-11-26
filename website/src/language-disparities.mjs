import { BENCHMARK_NAMES, mountDisparityPlot } from './leaderboard.mjs';

const font = {family:'Work Sans, system-ui, sans-serif', color:'#002d72'};
const sequential = [[0,'#a8cee8'],[.5,'#4689ba'],[1,'#002d72']];
const gapColors = [
  [0, '#f8f8fc'], [.0005, '#fde6e8'], [.25, '#f4b3ba'],
  [.5, '#de7882'], [.75, '#b53646'], [1, '#811d30'],
];

export function selectRuns(data, cohort, model = 'all') {
  const original = (data.original ?? []).map(row => ({...row,dataset:'original'}));
  const hard = (data.hard ?? []).map(row => ({...row,dataset:'hard'}));
  const rows = cohort === 'original' ? original : cohort === 'hard' ? hard : [...original,...hard];
  return model === 'all' ? rows : rows.filter(row => row.id === model);
}

export function disparityFigure({data,cohort,selected}, width) {
  const rows = selectRuns(data,cohort);
  const traces = [];
  const original = new Map(rows.filter(row => row.dataset === 'original').map(row => [row.id,row]));
  for (const hard of rows.filter(row => row.dataset === 'hard')) {
    const before = original.get(hard.id);
    if (before) traces.push({type:'scatter', mode:'lines', x:[before.query,hard.query],y:[before.source,hard.source],
      line:{color:'#aab7ca',width:1.5},showlegend:false,hoverinfo:'skip'});
  }
  for (const dataset of ['original','hard']) {
    const group = rows.filter(row => row.dataset === dataset);
    if (!group.length) continue;
    traces.push({type:'scatter',mode:'markers',name:BENCHMARK_NAMES[dataset],
      x:group.map(row=>row.query),y:group.map(row=>row.source),
      marker:{symbol:dataset==='hard'?'diamond':'circle',size:group.map(row=>selected==='all'||row.id===selected?14:9),
        opacity:group.map(row=>selected==='all'||row.id===selected?1:.25),color:group.map(row=>row.coverage),coloraxis:'coloraxis',
        line:{width:dataset==='hard'?2:1,color:dataset==='hard'?'#e54b5f':'#ffffff'}},
      customdata:group.map(row=>[row.name,BENCHMARK_NAMES[row.dataset],row.coverage,row.cases,row.id]),
      hovertemplate:'<b>%{customdata[0]}</b><br>%{customdata[1]}<br>Query-language gap: %{x:.2f} pp<br>Narrative-language gap: %{y:.2f} pp<br>Diverse-prompt recall: %{customdata[2]:.1f}%<br>%{customdata[3]:,} cases<extra></extra>'});
  }
  const labelled = selected==='all' ? [] : rows.filter(row=>row.id===selected);
  const extent = key => [0, Math.max(5, Math.ceil(Math.max(...rows.map(row=>row[key] ?? 0)) / 2) * 2 + 2)];
  return {traces,layout:{width,height:width<600?420:490,margin:{l:54,r:width<600?16:85,t:30,b:76},font,
    paper_bgcolor:'transparent',plot_bgcolor:'transparent',showlegend:false,hovermode:'closest',dragmode:'zoom',
    hoverlabel:{bgcolor:'#002d72',font:{color:'#fff'},align:'left'},
    xaxis:{title:{text:'Query-language gap from English (pp)',standoff:16},range:extent('query'),gridcolor:'#dbe3ee',zeroline:false},
    yaxis:{title:{text:'Narrative-language gap (pp)',standoff:8},range:extent('source'),gridcolor:'#dbe3ee',zeroline:false},
    coloraxis:{colorscale:sequential,cmin:0,cmax:100,showscale:width>=600,colorbar:{title:{text:'Diverse-prompt<br>recall (%)',font:{size:10}},thickness:10,len:.72,tickfont:{size:10}}},
    annotations:labelled.map((row,i)=>({x:row.query,y:row.source,text:row.name,
      showarrow:true,arrowhead:0,arrowcolor:'#7d8ea6',ax:width<600?-20:35,ay:(i===0?-45:i===1?-35:35),font:{size:width<600?9:11},bgcolor:'#f8f8fc',borderpad:3}))}};
}

export function languageGridFigure({data,cohort,selected,axis,languages}, width) {
  const rows=selectRuns(data,cohort).sort((a,b)=>Number(a.dataset==='hard')-Number(b.dataset==='hard')||a.name.localeCompare(b.name));
  const codes=[...new Set(rows.flatMap(row=>row.languages[axis].map(item=>item.language)))];
  const name=code=>axis==='query'?languages[code]??code:code;
  codes.sort((a,b)=>name(a).localeCompare(name(b)));
  const modelLabel=row=>row.name+(cohort==='original'||cohort==='hard'?'':` · ${BENCHMARK_NAMES[row.dataset]}`);
  const points=rows.flatMap(row=>row.languages[axis].map(item=>({...item,model:modelLabel(row),label:name(item.language),dataset:row.dataset,id:row.id})));
  const chartWidth=Math.max(width,990);
  const sharedMax = Math.max(50, Math.ceil(Math.max(...selectRuns(data,cohort).flatMap(row=>Object.values(row.languages).flatMap(items=>items.map(item=>Math.abs(item.gap))))) / 10) * 10);
  return {traces:[{type:'scatter',mode:'markers+text',x:points.map(p=>p.label),y:points.map(p=>p.model),
    marker:{symbol:'square',size:Math.min(24,Math.max(15,(chartWidth-300)/codes.length-4)),
      color:points.map(p=>Math.abs(p.gap)),colorscale:gapColors,cmin:0,cmax:sharedMax,
      opacity:points.map(p=>selected==='all'||p.id===selected?1:.42),
      line:{color:'#d9e2ec',width:.6},showscale:true,colorbar:{title:{text:'Absolute gap<br>from English (pp)'},dtick:10,thickness:10,len:.7}},
    text:points.map(p=>p.gap > 0 ? '+' : p.gap < 0 ? '−' : ''),
    textposition:'middle center',
    textfont:{size:13,weight:650,color:points.map(p=>Math.abs(p.gap) >= 30 ? '#ffffff' : '#291921')},
    customdata:points.map(p=>[p.model,p.score,p.english,p.gap,p.cases]),
    hovertemplate:'<b>%{customdata[0]}</b><br>%{x}<br>Score: %{customdata[1]:.1f}%<br>English: %{customdata[2]:.1f}%<br>Gap: %{customdata[3]:+.2f} pp<br>%{customdata[4]:,} cases<extra></extra>'}],
    layout:{width:chartWidth,height:Math.max(200,rows.length*29+155),margin:{l:294,r:104,t:16,b:115},font:{...font,size:10},
      paper_bgcolor:'transparent',plot_bgcolor:'transparent',hoverlabel:{bgcolor:'#002d72',font:{color:'#fff'},align:'left'},
      dragmode:false,showlegend:false,
      xaxis:{type:'category',categoryorder:'array',categoryarray:codes.map(name),tickangle:-55,showgrid:false,zeroline:false,fixedrange:true},
      yaxis:{type:'category',categoryorder:'array',categoryarray:rows.map(modelLabel),autorange:'reversed',showgrid:true,gridcolor:'#e4eaf2',zeroline:false,fixedrange:true}}};
}

async function initialize() {
  const $=id=>document.getElementById(id);
  const url=new URL('./data/language-disparities.json'+new URL(import.meta.url).search,import.meta.url);
  const response=await fetch(url);
  if(!response.ok)throw new Error('Language results could not load');
  const data=await response.json();
  const catalog=await fetch(new URL('./data/catalog.json'+new URL(import.meta.url).search,import.meta.url)).then(r=>r.json());
  const scatter=mountDisparityPlot($('disparity-plot'),$('disparity-status'),disparityFigure);
  const queryGrid=mountDisparityPlot($('language-grid'),$('language-grid-status'),languageGridFigure);
  const sourceGrid=mountDisparityPlot($('source-language-grid'),$('source-language-grid-status'),languageGridFigure);
  const names=new Map([...data.original,...data.hard].map(row=>[row.id,row.name]));
  const select=$('disparity-model');
  for(const [id,name] of [...names].sort((a,b)=>a[1].localeCompare(b[1])))select.append(new Option(name,id));
  function render() {
    const settings={data,cohort:'both',selected:select.value,languages:catalog.languages};
    scatter(settings);
    queryGrid({...settings,axis:'query'});
    sourceGrid({...settings,axis:'source'});
    const table=document.createElement('table');
    const head=table.createTHead().insertRow();
    for(const text of ['Model','Evaluation','Query-language gap (pp)','Narrative-language gap (pp)','Diverse recall (%)','Cases']){
      const th=document.createElement('th');th.scope='col';th.textContent=text;head.append(th);
    }
    for(const row of selectRuns(data,settings.cohort)){
      const tr=table.insertRow();
      for(const text of [row.name,BENCHMARK_NAMES[row.dataset],row.query.toFixed(2),row.source.toFixed(2),row.coverage.toFixed(1),row.cases.toLocaleString()]){
        const td=tr.insertCell();td.textContent=text;
      }
    }
    $('disparity-table').replaceChildren(table);
  }
  select.addEventListener('change',render);
  render();
  const host=$('disparity-plot');
  const bind=()=>{
    if(typeof host.on==='function')host.on('plotly_click',event=>{
      const id=event.points?.[0]?.customdata?.[4];
      if(names.has(id)){select.value=id;render();}
    });
  };
  const observer=new MutationObserver(()=>{if(typeof host.on==='function'){bind();observer.disconnect();}});
  observer.observe(host,{childList:true});
}
if(typeof document!=='undefined') void initialize().catch(()=>{
  document.getElementById('disparity-status').textContent='Language comparisons could not load. Refresh to try again.';
});
