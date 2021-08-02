export enum DogCeoResponseStatus {
  Success = "success",
  Error = "error",
}

export interface DogCeoResponse<T> {
  code?: number;
  message: string | T;
  status: DogCeoResponseStatus;
}
export type DogCeoImagesResponse = DogCeoResponse<string[]>;
export type DogCeoBreedsListResponse = DogCeoResponse<{
  [key: string]: string[];
}>;
