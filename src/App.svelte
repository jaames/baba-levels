<script lang="ts">
  import { Router, Link, Route, navigate } from 'svelte-navigator';
  import Index from './routes/Index.svelte';
  import Level from './routes/Level.svelte';

  export let searchCode = ''

  export function doSearch(event: Event) {
    navigate(`/baba-levels/level/${searchCode}`);
    event.preventDefault()
    return false;
  }
</script>

<Router basepath="/baba-levels" primary={false}>
  <div class="Page">
    <nav class="Nav Wrapper">
      <div class="NavGroup NavGroup--left">
        <div class="Intro">
          <h1 class="Intro__title"><Link to="/">Baba Levels</Link></h1>
          <span class="Intro__desc">Browse user-created levels from <a class="link" href="https://hempuli.com/baba/">Baba Is You</a></span>
        </div>
      </div>
      <div class="NavGroup NavGroup--right">
        <Link to="/">Featured Levels</Link>
        <form class="SearchBox" on:submit={doSearch}>
          <input class="SearchBox__input Input" bind:value={searchCode} placeholder="Level Code">
          <button class="SearchBox__button Button" type="submit">Search</button>
        </form>
      </div>
    </nav>
    <div class="Content Wrapper">
      <Route path="/">
        <Index />
      </Route>
      <Route path="level/:code" let:params>
        <Level code={ params.code } />
      </Route>
    </div>
    <footer class="Footer Wrapper">
      <span>Built by <a class="link" href="https://twitter.com/rakujira">James Daniel</a></span> | <a class="link" href="https://github.com/jaames/baba-levels">Source Code on GitHub</a>
    </footer>
  </div>
</Router>