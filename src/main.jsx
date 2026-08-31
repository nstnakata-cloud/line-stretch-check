import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import liff from '@line/liff'
import './styles.css'

const api = async (url, options={}) => { const r=await fetch(url,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options}); const data=await r.json().catch(()=>({})); if(!r.ok)throw new Error(data.message||'通信に失敗しました。'); return data }
const safetyText = 'このチェックだけでは安全にストレッチをおすすめできません。無理にストレッチを行わず、必要に応じて医療機関などへ相談してください。'
const visibleQuestions = (questions, answers) => questions.filter(q=>!q.when||answers[q.when.questionId]===q.when.equals)

function App(){
  const [config,setConfig]=useState(null),[lineId,setLineId]=useState(''),[view,setView]=useState('home'),[assessmentId,setAssessmentId]=useState(null),[answers,setAnswers]=useState({}),[step,setStep]=useState(0),[result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{api('/api/config').then(async c=>{setConfig(c);if(c.liffId){try{await liff.init({liffId:c.liffId});if(liff.isLoggedIn()){const id=(await liff.getProfile()).userId;setLineId(id);const saved=localStorage.getItem('lastAssessmentId');if(saved)await api(`/api/assessments/${saved}/link-line`,{method:'POST',body:JSON.stringify({lineUserId:id})}).catch(()=>{})}}catch{setError('LINEとの接続を確認できませんでした。ゲストとしてお試しいただけます。')}}}).catch(e=>setError(e.message))},[])
  const start=async(consent)=>{setBusy(true);setError('');try{const d=await api('/api/assessments/start',{method:'POST',body:JSON.stringify({lineUserId:lineId||localStorage.getItem('stretchGuestId')||makeGuest(),consent})});localStorage.setItem('lastAssessmentId',d.assessmentId);setAssessmentId(d.assessmentId);setAnswers(d.answers||{});const qs=visibleQuestions(config.questions,d.answers||{});const first=qs.findIndex(q=>!d.answers?.[q.id]);setStep(first<0?0:first);setView('questions')}catch(e){setError(e.message)}finally{setBusy(false)}}
  const choose=async answer=>{if(busy)return;setBusy(true);setError('');const current=visibleQuestions(config.questions,answers);const q=current[step];try{await api(`/api/assessments/${assessmentId}/answer`,{method:'PUT',body:JSON.stringify({questionId:q.id,answer})});const next={...answers,[q.id]:answer};setAnswers(next);const nextQuestions=visibleQuestions(config.questions,next);if(step===nextQuestions.length-1){const d=await api(`/api/assessments/${assessmentId}/complete`,{method:'POST'});setResult(d);setView('result')}else setStep(step+1)}catch(e){setError(e.message)}finally{setBusy(false)}}
  const reset=()=>{setAnswers({});setAssessmentId(null);setResult(null);setStep(0);setView('home')}
  if(!config)return <main className="shell"><div className="loading">準備しています…</div></main>
  return <main className="shell">
    <header><a className="brand" onClick={reset}><span>のび</span>チェック</a><button className="textButton" onClick={reset}>最初から</button></header>
    {error&&<div className="toast">{error}</div>}
    {view==='home'&&<Home start={start} busy={busy}/>}
    {view==='questions'&&<Questions questions={visibleQuestions(config.questions,answers)} step={step} answers={answers} choose={choose} back={()=>setStep(Math.max(0,step-1))} busy={busy}/>}
    {view==='result'&&<Result data={result} assessmentId={assessmentId} restart={reset}/>}
    <footer>これは医療診断ではありません。無理のない範囲でご利用ください。</footer>
  </main>
}
function makeGuest(){const id=`guest-${crypto.randomUUID()}`;localStorage.setItem('stretchGuestId',id);return id}

function Home({start,busy}){const[consent,setConsent]=useState(false);return <section className="hero">
  <div className="heroArt"><div className="sun"/><div className="person">＼<span>●</span>／<i/></div><div className="leaf l1">◖</div><div className="leaf l2">◗</div></div>
  <p className="eyebrow">60秒でかんたん</p><h1>今のあなたに合う<br/><em>3つのストレッチ</em>をチェック</h1><p className="lead">5〜6問にタップで答えるだけ。<br/>今日できる短いメニューをご案内します。</p>
  <label className="consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> 医療診断ではないこと、回答とLINE user IDをメニュー案内・フォローのために保存することを確認しました</label><a className="privacyLink" href="/privacy.html" target="_blank">プライバシーと削除方法</a><button className="primary" onClick={()=>start(consent)} disabled={busy||!consent}>{busy?'準備中…':'チェックを始める'} <b>→</b></button><p className="micro">登録不要・約60秒・いつでもやり直せます</p>
  <div className="featureRow"><span>☝️<small>タップだけ</small></span><span>⏱️<small>約60秒</small></span><span>🌿<small>やさしい内容</small></span></div>
  </section>}

function Questions({questions,step,answers,choose,back,busy}){const q=questions[step];return <section className="questionView">
  <div className="progressMeta"><span>{step+1} / {questions.length}</span><span>あと{questions.length-step}問</span></div><div className="progress"><i style={{width:`${(step+1)/questions.length*100}%`}}/></div>
  <div className="questionIcon">{q.id.includes('safety')?'♡':['◉','⌁','⌂','↝','○','✓'][step]}</div><p className="eyebrow">{q.id.includes('safety')?'安全のための確認':'あなたのことを教えてください'}</p><h2>{q.text}</h2>{q.id.includes('safety')&&<p className="hint">当てはまるものを1つ選んでください</p>}
  <div className="options">{q.options.map((o,i)=><button key={o} className={answers[q.id]===o?'selected':''} onClick={()=>choose(o)} disabled={busy}><span>{String.fromCharCode(65+i)}</span>{o}<b>›</b></button>)}</div>
  {step>0&&<button className="back" onClick={back}>← 前の質問に戻る</button>}
  </section>}

function Result({data,assessmentId,restart}){const [done,setDone]=useState([]);const unsafe=!!data?.assessment?.is_unsafe
  const activity=async(type,stretchId)=>{await api('/api/activity',{method:'POST',body:JSON.stringify({assessmentId,stretchId,eventType:type})});if(type==='completed_stretch')setDone(x=>[...new Set([...x,stretchId])])}
  if(unsafe)return <section className="resultView safety"><div className="resultIcon">♡</div><p className="eyebrow">安全のために</p><h2>今日はストレッチを<br/>お休みしましょう</h2><p>{safetyText}</p><div className="notice"><b>今回当てはまった内容</b><br/>{data.assessment.excluded_reason||'安全確認項目に該当しました'}<br/><br/>症状が強い、日常生活が難しい、急に悪くなっている場合は、医療機関や地域の相談窓口へ早めにご相談ください。</div><p className="micro">この結果は病名を示すものではありません。体調が落ち着いてから、必要に応じてもう一度チェックできます。</p><button className="secondary" onClick={restart}>最初に戻る</button></section>
  return <section className="resultView"><div className="confetti">· ✦　·　✦ ·</div><p className="eyebrow">チェック完了！</p><h2>あなたは<br/><em>「{data.assessment.type_name}」</em></h2><p className="description">{data.assessment.description}</p><div className="reason"><b>このタイプになった理由</b><span>{data.assessment.main_body_part}が気になる × 生活スタイルや動かした時の回答から選びました</span></div><div className="today"><span>今日これだけでOK</span><strong>約3分のマイメニュー</strong></div>
  <div className="menu">{data.menu.slice(0,3).map((s,i)=><article key={s.id} className={done.includes(s.id)?'done':''}><div className="thumb"><span>{i+1}</span><b>STRETCH</b></div><div className="stretchInfo"><h3>{s.name}</h3><p>{s.body_part} ・ {s.duration_seconds}秒</p><div><a href={s.video_url} target="_blank" rel="noreferrer" onClick={()=>activity('video_click',s.id)}>動画を見る ▶</a><button onClick={()=>activity('completed_stretch',s.id)}>{done.includes(s.id)?'✓ できた！':'できた！'}</button></div></div></article>)}</div>
  <div className="notice">痛みを感じたら中止してください。反動をつけず、呼吸を止めずに行いましょう。</div>{done.length>0&&<div className="celebrate">すばらしい！今日の一歩を記録しました 🌱</div>}<button className="secondary" onClick={restart}>もう一度チェックする</button></section>}

createRoot(document.getElementById('root')).render(<App/>)
