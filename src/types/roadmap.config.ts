export interface RoadmapGenerationConfig {
    maxLength: number,
    locale: Intl.Locale
    minLength: number
}

export const defaultGenerationConfig: RoadmapGenerationConfig = {
    maxLength: 10,
    minLength: 5,
    locale: new Intl.Locale("vi")
}