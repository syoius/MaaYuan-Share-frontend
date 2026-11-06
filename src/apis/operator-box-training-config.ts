import { OperatorBoxTrainingConfigApi } from '../utils/maa-copilot-client'

export async function loadOperatorBoxTrainingConfigs(boxId: string) {
  const response = await new OperatorBoxTrainingConfigApi({
    requireData: true,
  }).listOperatorBoxTrainingConfigs({ boxId })
  return response.data
}
