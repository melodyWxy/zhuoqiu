/**
 * 海报渲染预览：不依赖 DB/OSS，直接构造数据渲染到 /tmp/poster-*.png。
 * 运行：cd server && npx ts-node scripts/poster-preview.ts
 */
import { writeFileSync } from 'fs'
import { ReplayRendererService, type RenderInput } from '../src/match/replay-renderer.service'
import type { Narrative } from '../src/match/replay-narrative'

const renderer = new ReplayRendererService()

function nar(subline: string, championSlot: number | null, type: 'nine_ball' | 'eight_ball'): Narrative {
  return { headline: '', subline, championSlot, type }
}

const cases: Array<{ name: string; input: RenderInput }> = [
  {
    name: '1-duel-nineball',
    input: {
      matchType: 'nine_ball',
      matchCode: '7K2M',
      players: [
        { slot: 1, displayName: '张三', avatar: null },
        { slot: 2, displayName: '李四', avatar: null }
      ],
      scores: { 1: 9, 2: 6 },
      narrative: nar('时长 23 分钟 · 黄金9 ×1', 1, 'nine_ball'),
      qrPng: null
    }
  },
  {
    name: '2-tie',
    input: {
      matchType: 'nine_ball',
      matchCode: 'T9EQ',
      players: [
        { slot: 1, displayName: '张三', avatar: null },
        { slot: 2, displayName: '李四', avatar: null }
      ],
      scores: { 1: 7, 2: 7 },
      narrative: nar('时长 30 分钟 · 时间到', 1, 'nine_ball'),
      qrPng: null
    }
  },
  {
    name: '3-longname-twodigit',
    input: {
      matchType: 'nine_ball',
      matchCode: 'X9QP',
      players: [
        { slot: 1, displayName: '球室王者一号选手', avatar: null },
        { slot: 2, displayName: '新手小白练习生陪练', avatar: null }
      ],
      scores: { 1: 11, 2: 9 },
      narrative: nar('时长 41 分钟 · 大金 ×2', 1, 'nine_ball'),
      qrPng: null
    }
  },
  {
    name: '3b-podium',
    input: {
      matchType: 'nine_ball',
      matchCode: '7K2M',
      players: [
        { slot: 1, displayName: '王小五', avatar: null },
        { slot: 2, displayName: '张三', avatar: null },
        { slot: 3, displayName: '李四', avatar: null }
      ],
      scores: { 1: 11, 2: 9, 3: 6 },
      narrative: nar('时长 38 分钟', 1, 'nine_ball'),
      qrPng: null
    }
  },
  {
    name: '3c-podium-longname',
    input: {
      matchType: 'nine_ball',
      matchCode: 'X9QP',
      players: [
        { slot: 1, displayName: '球室王者一号选手', avatar: null },
        { slot: 2, displayName: '老王隔壁的张三', avatar: null },
        { slot: 3, displayName: '新手小白练习生', avatar: null }
      ],
      scores: { 1: 12, 2: 10, 3: 7 },
      narrative: nar('时长 45 分钟', 1, 'nine_ball'),
      qrPng: null
    }
  },
  {
    name: '4-multi',
    input: {
      matchType: 'nine_ball',
      matchCode: '7K2M',
      players: [
        { slot: 1, displayName: '王小五', avatar: null },
        { slot: 2, displayName: '张三', avatar: null },
        { slot: 3, displayName: '没头像的玩家', avatar: '🧍' },
        { slot: 4, displayName: '李四', avatar: null }
      ],
      scores: { 1: 15, 2: 11, 3: 8, 4: 5 },
      narrative: nar('时长 52 分钟', 1, 'nine_ball'),
      qrPng: null
    }
  },
  {
    name: '5-eightball',
    input: {
      matchType: 'eight_ball',
      matchCode: '88BP',
      players: [
        { slot: 1, displayName: '赵六', avatar: null },
        { slot: 2, displayName: '钱七', avatar: null }
      ],
      scores: { 1: 7, 2: 2 },
      narrative: nar('时长 35 分钟 · 9 局', 1, 'eight_ball'),
      qrPng: null
    }
  }
]

async function main() {
  for (const c of cases) {
    const buf = await renderer.render(c.input)
    const out = `/tmp/poster-${c.name}.png`
    writeFileSync(out, buf)
    console.log('wrote', out, `${(buf.length / 1024).toFixed(0)}KB`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
