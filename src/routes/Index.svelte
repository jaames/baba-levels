<script lang="ts">
  import { Link } from 'svelte-navigator';
  import { babaApi, babaAssets } from '../core';

  export let hasList = false;
  export let currentPage = 0;
  export let totalPages = 0;

  export function nextPage() {
    if (currentPage < totalPages - 1)
      currentPage += 1;
  }

  export function prevPage() {
    if (currentPage > 0)
      currentPage -= 1;
  }
  
  export function getLevelThumb(id: string) {
    return babaAssets.getThumbUrl(id);
  }

  export async function getLevelList(pageIndex: number) {
    const { numPages, levels } = await babaApi.listLevels('featured', pageIndex);
    hasList = true
    totalPages = numPages;
    return levels;
  };
</script>

<div class="LevelList">
  {#if hasList}
    <div class="LevelList__head">
      <h2 class="LevelList__title">
        Featured Levels
      </h2>
      <div class="LevelList__nav">
        <span class="LevelList__button Button" on:click="{prevPage}">
          &lt;
        </span>
        <span class="LevelList__currPage">
          {currentPage + 1} / {totalPages}
        </span>
        <span class="LevelList__button Button" on:click="{nextPage}">
          &gt;
        </span>
      </div>
    </div>
  {/if}
  <div class="LevelList__body">
    {#await getLevelList(currentPage)}
      <div class="Status">Loading...</div>
    {:then levels}
      {#each levels as level}
        <div class="LevelCard">
          <Link to="level/{ level.id }">
            <img class="LevelCard__thumb LevelThumb" src="{getLevelThumb(level.id)}" alt="">
            <h3 class="LevelCard__title">{level.name}</h3>
            <div class="LevelCard__author">By {level.author}</div>
            <div class="LevelCard__difficulty">{level.difficulty}</div>
            <p class="LevelCard__description">{level.desc}</p>
            <!-- <div class="LevelCard__id">{level.id}</div> -->
          </Link>
        </div>
      {/each}
    {:catch error}
      <div class="Status">Error fetching level list: {error.message}</div>
    {/await}
  </div>
</div>