<script lang="typescript">
  import { babaApi, babaAssets } from '../core';

  export let code;

  export function getLevelThumb(id: string) {
    return babaAssets.getThumbUrl(id);
  }

  export async function getLevelInfo(levelId: string) {
    return await babaApi.getLevel(levelId);
  };
</script>

<div>
  {#await getLevelInfo(code)}
    <!-- promise is pending -->
    <p>Loading...</p>
  {:then level}
    <img class="LevelThumb" src="{getLevelThumb(code)}" alt="">
    <div>{level.name}</div>
    <div>{level.author}</div>
    <div>{level.difficulty}</div>
  {:catch error}
    <!-- promise was rejected -->
    <p>Error fetching level: {error.message}</p>
  {/await}
</div>