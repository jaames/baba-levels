<script lang="ts">
  import { Router, Link, Route } from 'svelte-navigator';
  import Index from './routes/Index.svelte';
  import Level from './routes/Level.svelte';
</script>

<Router basepath="/baba-levels">
  <nav class="Nav Wrapper">
    <div class="NavGroup NavGroup--left">
      <div class="Intro">
        <h1 class="Intro__title"><Link to="/">Baba Levels</Link></h1>
        <span class="Intro__desc">Browse user-created levels from <a class="link" href="https://hempuli.com/baba/">Baba Is You</a></span>
      </div>
    </div>
    <div class="NavGroup NavGroup--right">
      <Link to="/">Featured Levels</Link>
      <!-- <input type="" placeholder="Search Level Code"> -->
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
</Router>