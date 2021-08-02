export type FileInputEventTarget = EventTarget & {
    files: FileList;
    target: HTMLInputElement;
};