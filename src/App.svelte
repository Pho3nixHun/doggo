<script lang="ts">
  import "@tensorflow/tfjs-backend-cpu";
  import "@tensorflow/tfjs-backend-webgl";
  import * as mobilenet from "@tensorflow-models/mobilenet";
  import { from, Subject, fromEvent, forkJoin, Observable, merge } from "rxjs";
  import {
    withLatestFrom,
    switchMap,
    map,
    mapTo,
    take,
    filter,
    shareReplay,
  } from "rxjs/operators";
  import { fly } from "svelte/transition";
  import similarity from "similarity";


  // TODO: Move typings to separate files. BLOCKER: Time, rollup needs to be adjusted for this.
  enum DogCeoResponseStatus {
    Success = "success",
    Error = "error",
  }

  interface DogCeoResponse<T> {
    code?: number;
    message: string | T;
    status: DogCeoResponseStatus;
  }
  type DogCeoImagesResponse = DogCeoResponse<string[]>;
  type DogCeoBreedsListResponse = DogCeoResponse<{ [key: string]: string[] }>;
  type FileInputEventTarget = EventTarget & {
    files: FileList;
    target: HTMLInputElement;
  };

  export let maxImages = 20;
  export let animationProperties = { y: 20, duration: 300 };

  // TODO: Move to separate helper file.
  const preloadImage = (url: string): Observable<string> => {
    return from(fetch(url)).pipe(
      switchMap((response) => response.blob()),
      switchMap((blob) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        return fromEvent(reader, "load").pipe(take(1), mapTo(reader));
      }),
      map((reader) => reader.result as string)
    );
  };

  let imgElement: HTMLImageElement;
  let inputElement: HTMLInputElement;
  let dropAreaHighlighted: boolean = false;

  // TODO: Move Subjects/Observables to store. BLOCKER: Time;
  const model$ = from(
    mobilenet.load({
      version: 2,
      alpha: 1,
	  // @TODO: Find a model which specialized for dogs, to prevent recognition of other things.
	  // modelUrl: ''
    })
  );
  const openFilePickerTrigger$ = new Subject<void>();
  const selectedFiles$ = openFilePickerTrigger$.pipe(
    switchMap(() => {
      inputElement.click();
      return fromEvent(inputElement, "change");
    }),
    map((event) => (<FileInputEventTarget>event.target).files)
  );
  const droppedFiles$ = new Subject<FileList>();
  const image$ = merge(selectedFiles$, droppedFiles$).pipe(
    switchMap((files: FileList) => {
      const reader = new FileReader();
      reader.readAsDataURL(files[0]);
      return fromEvent(reader, "load").pipe(map(() => reader.result as string));
    })
  );
  const classificationTrigger$ = new Subject<void>();
  const prediction$ = classificationTrigger$.pipe(
    withLatestFrom(model$),
    switchMap(([, model]) => from(model.classify(imgElement))),
    map((predictions) => ({
      className: predictions[0].className.split(",")[0],
      probability: (predictions[0].probability * 100).toFixed(0),
    }))
  );
  const breedsList$ = from(fetch("https://dog.ceo/api/breeds/list/all")).pipe(
    switchMap((response) => response.json()),
    filter(
      (response: DogCeoBreedsListResponse) =>
        response.status === DogCeoResponseStatus.Success
    ),
    map((response: DogCeoBreedsListResponse) =>
      Object.entries(response.message).reduce((acc, [breed, subBreedsList]) => {
        const subBreeds = subBreedsList.map(
          (subBreed) => `${breed}/${subBreed}`
        );
        return [...acc, breed, ...subBreeds];
      }, [])
    ),
    take(1),
    shareReplay(1)
  );
  const breed$ = prediction$.pipe(
    map((prediction) => prediction.className.split(/\s/)[0])
  );

  const otherPictures$ = breed$.pipe(
    withLatestFrom(breedsList$),
	// Finds the most similar breed available in DogCeo's API
    map(([breed, breeds]) =>
      breeds.reduce(
        (acc, currentBreed) => {
          const score = similarity(currentBreed, breed);
          if (acc.score < score) {
            return {
              breed: currentBreed,
              score,
            };
          }
          return acc;
        },
        { breed, score: -1 }
      )
    ),
    map((breedSimilar) => breedSimilar.breed),
    switchMap((breed) =>
      from(fetch(`https://dog.ceo/api/breed/${breed}/images`))
    ),
    switchMap((response) => response.json() as Promise<DogCeoImagesResponse>),
    map((data) =>
      data.status === DogCeoResponseStatus.Success
        ? (data.message as string[]).slice(0, maxImages)
        : []
    ),
    switchMap((urls) => forkJoin(urls.map(preloadImage)))
  );
</script>

<main
  class="d-flex flex-column place-content-center gap-2 w-100 min-h-100"
  class:highlight={dropAreaHighlighted}
  on:drop|preventDefault|stopPropagation={(event) =>
    droppedFiles$.next(event.dataTransfer.files)}
  on:dragenter={() => (dropAreaHighlighted = true)}
  on:dragover|preventDefault|stopPropagation={() =>
    (dropAreaHighlighted = true)}
  on:dragleave={() => (dropAreaHighlighted = false)}
  on:drop|preventDefault|stopPropagation={() => (dropAreaHighlighted = false)}
>
  {#if $model$}
    <form
      class="d-flex flex-column align-items-center gap-1"
      on:click={() => openFilePickerTrigger$.next()}
      in:fly={animationProperties}
    >
      {#if $image$}
        <div class="n-text">Try another doggo?</div>
      {:else}
        <div class="n-text pointer">Drop it like it's hot</div>
        <p class="pointer">(or click/tap)</p>
      {/if}
      <input type="file" accept="image/*" hidden bind:this={inputElement} />
      {#if $image$}
        <img
          src={$image$}
          alt="Provided"
          class="n"
          in:fly={animationProperties}
          bind:this={imgElement}
          on:load={() => classificationTrigger$.next()}
        />
      {/if}
      {#if $prediction$}
        <h2 in:fly={animationProperties}>
          I'm pretty sure (like {$prediction$.probability}%) it's a
          <span class="capitalize darken">{$prediction$.className}</span>.
        </h2>
      {/if}
    </form>
  {:else}
    <div
      class="d-flex flex-column align-items-center gap-1"
      out:fly={{ y: -20, duration: 300 }}
    >
      <img class="logo" src="/logo.svg" alt="" />
      <div class="n-text">Just a sec...</div>
    </div>
  {/if}
  <div>
    {#if $prediction$}
      <h1 in:fly={animationProperties}>
        More pictures of {$prediction$.className}s
      </h1>
    {/if}
    {#if $prediction$ && !$otherPictures$}
      <div class="d-flex flex-column align-items-center">
        <div class="mt-2">Letting the dogs out...</div>
      </div>
    {:else if $otherPictures$}
      <div class="moreLikeThis">
        {#each $otherPictures$ as img, i}
          <img
            src={img}
            alt={$breed$}
            in:fly={{ y: 20, duration: 300, delay: i * 50 }}
            out:fly={{ y: -20, duration: 300, delay: i * 50 }}
          />
        {/each}
		{#if $otherPictures$.length === 0}
			<p>Cannot find more doggos like this</p>
		{/if}
      </div>
    {/if}
  </div>
</main>

<style lang="scss">
  // TODO: Move shared utility classes to separate scss file. BLOCKER: Time. Rollup need to be adjusted for this.
  @use "sass:math";
  @use "sass:color";

  $base-color: hsl(253, 10%, 83%);
  :root {
    box-sizing: border-box;
    font-size: 14px;
    font-family: sans-serif;
  }
  /* Typography */
  $golden-ratio: 1.61803398875;
  $spacings: (
    "0-5": 1rem * math.pow($golden-ratio, 0.5),
    "1": 1rem * $golden-ratio,
    "2": 1rem * math.pow($golden-ratio, 2),
  );
  $font-sizes: (
    "0-5": 1rem * math.pow($golden-ratio, 0.5),
    "1": 1rem * $golden-ratio,
    "2": 1rem * math.pow($golden-ratio, 2),
  );

  h1 {
    text-transform: uppercase;
  }
  h1,
  h2 {
    color: hsl(253, 10%, 65%);
  }

  .darken {
    color: hsl(253, 10%, 50%);
  }
  .pointer {
    cursor: pointer;
  }

  /* Layout */
  .d-flex {
    display: flex;
    &.flex-column {
      flex-direction: column;
    }
    &.align-items-center {
      align-items: center;
    }
    &.place-content-center {
      place-content: center;
    }
    @each $spacing-name, $spacing-value in $spacings {
      &.gap-#{$spacing-name} {
        gap: #{$spacing-value} !important;
      }
    }
  }
  @each $spacing-name, $spacing-value in $spacings {
    .mt-#{$spacing-name} {
      margin-top: #{$spacing-value} !important;
    }
  }

  /* Utilities */
  .w-100 {
    width: 100%;
  }
  .min-h-100 {
    min-height: 100%;
  }

  .capitalize {
    text-transform: capitalize;
  }

  /* Component related */

  .logo {
    width: 8vw;
  }

  .n-text {
    color: hsl(253, 10%, 75%);
    font-size: map-get($font-sizes, "2");
    font-weight: bold;
    font-family: sans-serif;
    text-transform: uppercase;
    text-shadow: -6px 6px 15px hsl(255, 5%, 71%),
      6px -6px 15px hsl(252, 42%, 95%);
    transition: text-shadow 300ms ease;
    position: relative;
  }

  main {
    border: 10px dashed transparent;
    border-radius: 32px;
  }

  .highlight {
    border: 10px dashed hsl(253, 10%, 80%);
  }

  img {
    max-width: 450px;
    height: auto;
    border: 2px solid #e0dde7;
    object-fit: contain;
    &.n {
      border-radius: 32px;
      background: linear-gradient(
        145deg,
        hsl(258, 17%, 89%),
        hsl(255, 6%, 75%)
      );
      box-shadow: 20px 20px 60px hsl(255, 5%, 71%),
        -20px -20px 60px hsl(252, 42%, 95%);
    }
  }

  .moreLikeThis {
    line-height: 0;
    column-count: 6;
    column-gap: 10px;
    img {
      margin-bottom: 10px;
      width: 100% !important;
      height: auto !important;
    }
  }

  @media (max-width: 1600px) {
    .moreLikeThis {
      column-count: 5;
    }
  }
  @media (max-width: 1300px) {
    .moreLikeThis {
      column-count: 4;
    }
  }
  @media (max-width: 1000px) {
    .moreLikeThis {
      column-count: 3;
    }
  }
  @media (max-width: 800px) {
    .moreLikeThis {
      column-count: 2;
    }
  }
  @media (max-width: 600px) {
    .moreLikeThis {
      column-count: 1;
    }
  }
</style>
