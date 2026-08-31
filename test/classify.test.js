import test from 'node:test'
import assert from 'node:assert/strict'
import { classify, questions, applicableQuestions, typeDefinitions } from '../server/catalog.js'

const base={timing:'特に決まっていない',lifestyle:'よく歩く',movement:'少し楽になる',safety:'どれも当てはまらない'}
for(const [part,slug] of [['首','same-posture'],['肩','stiff-shoulder'],['腰','hip-link'],['脚','tight-quads']]) test(`${part}が正常に判定される`,()=>assert.equal(classify({...base,body_part:part}).slug,slug))
for(const symptom of ['じっとしていても強く痛む','じんじんする・感覚が鈍い','ぶつけた・転んだ・ひねった後','短期間で急につらくなった']) test(`${symptom}は安全案内になる`,()=>assert.equal(classify({...base,body_part:'腰',safety:symptom}).unsafe,true))
test('動かして悪化する場合は安全案内になる',()=>assert.equal(classify({...base,body_part:'腰',movement:'悪化する'}).unsafe,true))
test('同じ回答は同じ結果になる',()=>assert.deepEqual(classify({...base,body_part:'首'}),classify({...base,body_part:'首'})))
test('腰だけ追加安全質問が表示される',()=>{assert.equal(applicableQuestions({body_part:'腰'}).some(q=>q.id==='lower_back_safety'),true);assert.equal(applicableQuestions({body_part:'首'}).some(q=>q.id==='lower_back_safety'),false)})
test('腰の追加安全条件は動画を出さない',()=>assert.equal(classify({...base,body_part:'腰',lower_back_safety:'夜眠れないほど痛む'}).unsafe,true))

test('安全除外以外の全回答組み合わせは必ず存在する1タイプに決まる',()=>{
  const option=id=>questions.find(q=>q.id===id).options
  const slugs=new Set(typeDefinitions.map(x=>x[0]));let checked=0
  for(const body_part of option('body_part'))for(const timing of option('timing'))for(const lifestyle of option('lifestyle'))for(const movement of ['少し楽になる','特に変わらない','よく分からない']){
    const outcome=classify({body_part,timing,lifestyle,movement,safety:'どれも当てはまらない',lower_back_safety:'どれも当てはまらない'})
    assert.equal(outcome.unsafe,false);assert.equal(slugs.has(outcome.slug),true,JSON.stringify({body_part,timing,lifestyle,movement,outcome}));checked++
  }
  assert.equal(checked,540)
})
