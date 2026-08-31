export const bodyParts = ['首', '肩', '背中', '腰', '股関節', '脚']

export const questions = [
  { id: 'body_part', text: '今、一番気になるところは？', options: bodyParts },
  { id: 'safety', text: '安全のため、当てはまるものはありますか？', options: ['じっとしていても強く痛む', 'じんじんする・感覚が鈍い', '力が入らない・つまずく', 'ぶつけた・転んだ・ひねった後', '短期間で急につらくなった', 'どれも当てはまらない'] },
  { id: 'lower_back_safety', text: '腰について、当てはまるものはありますか？', options: ['夜眠れないほど痛む', '熱がある・体調が悪い', '排尿や排便の様子が急に変わった', 'どれも当てはまらない'], when: { questionId: 'body_part', equals: '腰' } },
  { id: 'timing', text: 'どんな時に気になりますか？', options: ['長く座っている時', '立っている時', '前にかがんだ時', '後ろに反った時', '朝起きた時', '特に決まっていない'] },
  { id: 'lifestyle', text: '普段、一番近い生活スタイルは？', options: ['デスクワークが多い', '立ち仕事が多い', 'よく歩く', '運動をしている', 'あまり身体を動かさない'] },
  { id: 'movement', text: '身体を軽く動かした時は？', options: ['少し楽になる', '特に変わらない', '悪化する', 'よく分からない'] },
]

export const typeDefinitions = [
  ['phone-neck','スマホ首タイプ','首','下を向く時間が長く、首から胸まわりが固まりやすいタイプです。'],
  ['desk-neck','デスクワーク首タイプ','首','同じ姿勢が続き、首や肩を動かす機会が少なくなりがちなタイプです。'],
  ['stiff-shoulder','肩ガチガチタイプ','肩','肩まわりに力が入りやすく、ゆっくり動かしたいタイプです。'],
  ['rounded-shoulder','猫背肩タイプ','肩','胸の前と背中を一緒に動かすとすっきりしやすいタイプです。'],
  ['tight-chest','胸まわり硬めタイプ','背中','胸の前が縮こまり、背中まで動かしにくくなりがちなタイプです。'],
  ['desk-back','座りっぱなし背中タイプ','背中','座る時間が長く、背中全体の動きが小さくなりがちなタイプです。'],
  ['sitting-lower-back','座りっぱなし腰タイプ','腰','長時間同じ姿勢が続き、お尻や股関節も動かしにくくなりがちなタイプです。'],
  ['inactive-lower-back','動かなさすぎ腰タイプ','腰','身体を動かす機会が少なく、腰まわりが固まりやすいタイプです。'],
  ['arched-posture','反り姿勢タイプ','腰','腰だけでなく、股関節の前側もやさしく動かしたいタイプです。'],
  ['forward-bend','前屈しにくいタイプ','腰','お尻や太もも裏を含めて無理なく動かしたいタイプです。'],
  ['hip-link','股関節連動タイプ','腰','腰と股関節をセットで動かすのが合いやすいタイプです。'],
  ['stiff-hips','股関節カチコチタイプ','股関節','股関節をいろいろな方向へ小さく動かしたいタイプです。'],
  ['tight-glutes','お尻硬めタイプ','股関節','座る時間などで、お尻まわりが固まりやすいタイプです。'],
  ['tight-quads','太もも前ガチガチタイプ','脚','太ももの前側をゆっくり伸ばしたいタイプです。'],
  ['tight-hamstrings','太もも裏ガチガチタイプ','脚','太もも裏を反動をつけずに動かしたいタイプです。'],
  ['tight-calves','ふくらはぎ硬めタイプ','脚','立つ・歩く動作で頑張るふくらはぎを整えたいタイプです。'],
  ['whole-body','全身ガチガチタイプ','背中','一部分だけでなく、全身を少しずつ動かしたいタイプです。'],
  ['low-activity','運動不足タイプ','脚','短い時間から身体を動かす習慣を作りたいタイプです。'],
  ['same-posture','長時間同姿勢タイプ','肩','こまめなリセットが合いやすいタイプです。'],
  ['active-care','軽い運動習慣タイプ','脚','今の運動習慣に短いケアを足すのが合いやすいタイプです。'],
]

export const unsafeAnswers = new Set(['じっとしていても強く痛む','じんじんする・感覚が鈍い','力が入らない・つまずく','ぶつけた・転んだ・ひねった後','短期間で急につらくなった'])
export const unsafeLowerBackAnswers = new Set(['夜眠れないほど痛む','熱がある・体調が悪い','排尿や排便の様子が急に変わった'])

export const applicableQuestions = answers => questions.filter(q => !q.when || answers[q.when.questionId] === q.when.equals)

export function classify(answers) {
  if (unsafeAnswers.has(answers.safety) || unsafeLowerBackAnswers.has(answers.lower_back_safety) || answers.movement === '悪化する') return { unsafe: true, reason: unsafeAnswers.has(answers.safety) ? answers.safety : unsafeLowerBackAnswers.has(answers.lower_back_safety) ? answers.lower_back_safety : '動かすとつらくなる' }
  const part = answers.body_part
  const desk = answers.lifestyle === 'デスクワークが多い'
  const inactive = answers.lifestyle === 'あまり身体を動かさない'
  const active = answers.lifestyle === '運動をしている'
  const timing = answers.timing
  let slug
  if (part === '首') slug = desk ? 'desk-neck' : timing === '前にかがんだ時' ? 'phone-neck' : 'same-posture'
  else if (part === '肩') slug = desk ? 'rounded-shoulder' : timing === '特に決まっていない' ? 'stiff-shoulder' : 'same-posture'
  else if (part === '背中') slug = desk ? 'desk-back' : inactive ? 'whole-body' : 'tight-chest'
  else if (part === '腰') slug = desk || timing === '長く座っている時' ? 'sitting-lower-back' : timing === '後ろに反った時' ? 'arched-posture' : timing === '前にかがんだ時' ? 'forward-bend' : inactive ? 'inactive-lower-back' : 'hip-link'
  else if (part === '股関節') slug = desk ? 'tight-glutes' : 'stiff-hips'
  else slug = active ? 'active-care' : timing === '立っている時' ? 'tight-calves' : timing === '前にかがんだ時' ? 'tight-hamstrings' : inactive ? 'low-activity' : 'tight-quads'
  return { unsafe: false, slug }
}
