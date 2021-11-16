<script lang="ts">
  import { babaApi, babaAssets } from '../core';

  export let code;

  export function getLevelThumb(id: string) {
    return babaAssets.getThumbUrl(id);
  }

  export async function getLevelInfo(levelId: string) {
    return await babaApi.getLevel(levelId);
  };
</script>

{#await getLevelInfo(code)}
  <!-- promise is pending -->
  <div class="Status">Loading...</div>
{:then level}
  <div class="LevelDetail">
    <img class="LevelDetail__thumb LevelThumb" src="{getLevelThumb(code)}" alt="">
    <div class="LevelDetail__info">
      <h3 class="LevelDetail__title">{level.name}</h3>
      <div class="LevelDetail__author">By {level.author}</div>
      <div class="LevelDetail__difficulty">Difficulty: {level.difficulty}</div>
      <p class="LevelDetail__code">Code: {code}</p>
    </div>
  </div>
{:catch error}
  <!-- promise was rejected -->
  <div class="Status">Error fetching level</div>
{/await}