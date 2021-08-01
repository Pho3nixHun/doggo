<script lang="ts">
	import '@tensorflow/tfjs-backend-cpu';
	import '@tensorflow/tfjs-backend-webgl';
	import * as mobilenet from '@tensorflow-models/mobilenet';
	import { from, Subject, fromEvent } from 'rxjs';
	import { withLatestFrom, switchMap, map } from 'rxjs/operators';

	export const model$ = from(
		mobilenet.load({
			version: 2,
			alpha: 1
		})
	);
	export let imgElement;
	export let inputElement;
	export const uploadClickTrigger$ = new Subject<void>();
	export const image = uploadClickTrigger$.pipe(
		// This is necessary to be able to hide and style the upload "button".
		switchMap(() => {
			inputElement.click();
			return fromEvent(inputElement, 'change');
		}),
		switchMap(event => {
			const reader = new FileReader();
			reader.readAsDataURL(event.target.files[0]);
			return fromEvent(reader, 'load');
		}),
		map(event => event.target.result)
	)
	export const classificationTrigger$ = new Subject<void>();
	export const prediction = classificationTrigger$.pipe(
		withLatestFrom(model$),
		switchMap(([, model]) => from(model.classify(imgElement))),
		map(predictions => ({className: predictions[0].className.split(',')[0], probability: (predictions[0].probability * 100).toFixed(0)}))
	);
</script>

<main class="d-flex flex-column align-items-center gap-1" on:click="{() => uploadClickTrigger$.next()}">
	<div>
		{#if $image}
			<span class="hover-highlight">Click here</span> to try with a new image?
		{:else}
			<span class="hover-highlight">Click here</span> or drag here your image to indetify the doggo.
		{/if}
	</div>
	<input type="file" hidden name="userprofile_picture"  id="filePhoto" bind:this={inputElement} />
	{#if $image}
		<img src="{$image}" alt="" bind:this={imgElement} on:load="{() => classificationTrigger$.next()}">
	{/if}
	{#if $prediction}
		<h2> {$prediction.className} </h2>
		<p> (Probability: {$prediction.probability}%) </p>
	{/if}
</main>

<style lang="scss">
	@use "sass:math";
	@use "sass:color";

	/* Typography */
	$golden-ratio: 1.61803398875;
	$spacings: (
		0: 0rem,
		0-5: 1rem * math.pow($golden-ratio, 0.5),
		1: 1rem * $golden-ratio,
		1-5: 1rem * math.pow($golden-ratio, 1.5),
		2: 1rem * math.pow($golden-ratio, 2),
		3: 1rem * math.pow($golden-ratio, 2),
		4: 1rem * math.pow($golden-ratio, 4),
		5: 1rem * math.pow($golden-ratio, 5)
	);

	/* Layout */
	.d-flex {
		display: flex;
		&.flex-column {
			flex-direction: column;		
		}
		&.align-items-center {
			align-items: center;
		}
		@each $spacing-name, $spacing-value in $spacings {
			&.gap-#{$spacing-name} {
				gap: #{$spacing-value} !important;
			}
		}
	}

	/* Component related */
	main {
		text-align: center;
		padding: 1em;
		max-width: 240px;
		margin: 0 auto;
		border: 8px dashed transparent;
		border-radius: 16px;
	}
	main:hover {
		cursor: pointer;
		border-color: gray;
		.hover-highlight {
			color: blue;
		}
	}

	img {
		max-width: 350px;
		border: 1px solid #ededed;
	}

	@media (min-width: 640px) {
		main {
			max-width: none;
		}
	}
</style>