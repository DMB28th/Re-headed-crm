export type WidgetName = "record-card" | "results-table" | "home-card";
export declare const WIDGET_NAMES: WidgetName[];
export declare function getWidgetHtml(name: WidgetName): Promise<string>;
