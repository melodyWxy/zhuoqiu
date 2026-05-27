import { callApi } from './client'

export type FeedbackType = 'bug' | 'suggestion' | 'cooperation'

export const feedbackApi = {
  submit: (body: { type: FeedbackType; content: string }) =>
    callApi<{ id: string }>('/feedback', {
      method: 'POST',
      data: body,
      auth: true
    })
}
