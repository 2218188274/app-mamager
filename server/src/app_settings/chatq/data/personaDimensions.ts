/**
 * 聊商人设标签维度与标签主数据（完整 151 标签，与标签体系 v3.0 文档一致）
 * 数据源：personaDimensions.json
 */
import dimensionsData from "./personaDimensions.json" with { type: "json" };

export interface PersonaTagItem {
  id: string;
  name: string;
  sentiment: "positive" | "neutral" | "negative";
  weight_default: number;
  description: string;
}

export interface PersonaDimensionItem {
  id: string;
  name: string;
  description: string;
  sort: number;
  tags: PersonaTagItem[];
}

type DimensionsJson = { dimensions: PersonaDimensionItem[] };
export const CHATQ_PERSONA_DIMENSIONS: PersonaDimensionItem[] = (
  dimensionsData as DimensionsJson
).dimensions;
