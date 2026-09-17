export interface Lesson {
  topic?: string;
  title?: string;
  grade?: string;
  question?: string;
  answer?: string;
  solution?: string;
  imagePath?: string;
  targetDurationSeconds?: number;
  hook?: string;
  cta?: string;
  equationSteps?: string[];
}

export type SceneKind = "title" | "question" | "solution" | "answer";

export interface Scene {
  kind: SceneKind;
  text: string;
  imagePath?: string;
}

export interface Storyboard {
  version: 1;
  scenes: Scene[];
}

export interface RunPaths {
  root: string;
  lesson: string;
  storyboard: string;
  audio: string;
  preview: string;
  render: string;
  review: string;
}

export interface RunDirectory {
  id: string;
  paths: RunPaths;
}
