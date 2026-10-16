/** SVG 画布和样式常量 */
export const CANVAS_WIDTH = 400;
export const CANVAS_HEIGHT = 300;
export const MARGIN = 40;
export const STROKE_WIDTH = 3;
export const STROKE_COLOR = "#39323f";
export const FILL_COLOR_LIGHT = "#f5f1f9";
export const FONT_SIZE = 18;
export const LABEL_OFFSET = 14;
/** 顶点标签里的撇（C′）实际渲染为小号上标，避免掉到基线上看起来像逗号 */
export const PRIME_FONT_SIZE = 12;
export const PRIME_RISE = 8;
export const BASE_Y = CANVAS_HEIGHT - MARGIN;          // 共线点的 y 坐标
export const TRI_HEIGHT_RATIO = 0.55;                   // 三角形高度占画布高度的比例
export const TRI_HEIGHT = CANVAS_HEIGHT * TRI_HEIGHT_RATIO; // 默认三角形高度
