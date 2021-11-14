<script lang="typescript">
  import { Link } from 'svelte-navigator';
  import { babaApi, babaAssets } from '../core';

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
    totalPages = numPages;
    return levels;
  };
</script>

<div class="LevelList">
  <div class="LevelList__head">
    <h2 class="LevelList__title">
      Featured Levels
    </h2>
    <div class="LevelList__nav">
      <span class="LevelList__button" on:click="{prevPage}">
        &lt;
      </span>
      <span class="LevelList__currPage">
        {currentPage + 1} / {totalPages}
      </span>
      <span class="LevelList__button" on:click="{nextPage}">
        &gt;
      </span>
    </div>
  </div>
  <div class="LevelList__body">
    {#await getLevelList(currentPage)}
      <p>Loading...</p>
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
      <p>Error fetching level list: {error.message}</p>
    {/await}
  </div>
</div>