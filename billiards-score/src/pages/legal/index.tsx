import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import {
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_OPERATOR,
  LegalSection
} from './content'
import './index.scss'

type LegalType = 'privacy' | 'terms'

function pickSections(type: LegalType): { title: string; sections: LegalSection[] } {
  if (type === 'terms') {
    return { title: '用户服务协议', sections: TERMS_SECTIONS }
  }
  return { title: '隐私政策', sections: PRIVACY_SECTIONS }
}

export default function LegalPage() {
  const router = useRouter()
  const type: LegalType = router.params.type === 'terms' ? 'terms' : 'privacy'
  const { title, sections } = pickSections(type)

  useDidShow(() => {
    Taro.setNavigationBarTitle({ title }).catch(() => {})
  })

  return (
    <View className='legal-page'>
      <ScrollView scrollY className='legal-inner'>
        <Text className='legal-header'>{`《${title}》`}</Text>
        <Text className='legal-subheader'>
          {`${LEGAL_OPERATOR} · 生效日期 ${LEGAL_EFFECTIVE_DATE}`}
        </Text>

        {sections.map((sec) => (
          <View key={sec.heading} className='legal-section'>
            <Text className='legal-section-heading'>{sec.heading}</Text>
            {sec.paragraphs.map((p, i) => (
              <Text key={i} className='legal-paragraph'>{p}</Text>
            ))}
          </View>
        ))}

        <View className='legal-footer'>
          <Text>{`本文档为击球帮 MVP 版本，最终解释权归 ${LEGAL_OPERATOR} 运营方所有。`}</Text>
        </View>
      </ScrollView>
    </View>
  )
}
