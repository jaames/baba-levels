function noop() { }
function assign(tar, src) {
    // @ts-ignore
    for (const k in src)
        tar[k] = src[k];
    return tar;
}
function is_promise(value) {
    return value && typeof value === 'object' && typeof value.then === 'function';
}
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}
function subscribe(store, ...callbacks) {
    if (store == null) {
        return noop;
    }
    const unsub = store.subscribe(...callbacks);
    return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}
function get_store_value(store) {
    let value;
    subscribe(store, _ => value = _)();
    return value;
}
function component_subscribe(component, store, callback) {
    component.$$.on_destroy.push(subscribe(store, callback));
}
function create_slot(definition, ctx, $$scope, fn) {
    if (definition) {
        const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
        return definition[0](slot_ctx);
    }
}
function get_slot_context(definition, ctx, $$scope, fn) {
    return definition[1] && fn
        ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
        : $$scope.ctx;
}
function get_slot_changes(definition, $$scope, dirty, fn) {
    if (definition[2] && fn) {
        const lets = definition[2](fn(dirty));
        if ($$scope.dirty === undefined) {
            return lets;
        }
        if (typeof lets === 'object') {
            const merged = [];
            const len = Math.max($$scope.dirty.length, lets.length);
            for (let i = 0; i < len; i += 1) {
                merged[i] = $$scope.dirty[i] | lets[i];
            }
            return merged;
        }
        return $$scope.dirty | lets;
    }
    return $$scope.dirty;
}
function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
    const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
    if (slot_changes) {
        const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
        slot.p(slot_context, slot_changes);
    }
}
function exclude_internal_props(props) {
    const result = {};
    for (const k in props)
        if (k[0] !== '$')
            result[k] = props[k];
    return result;
}
function compute_rest_props(props, keys) {
    const rest = {};
    keys = new Set(keys);
    for (const k in props)
        if (!keys.has(k) && k[0] !== '$')
            rest[k] = props[k];
    return rest;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached
    const children = target.childNodes;
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        const seqLen = upper_bound(1, longest + 1, idx => children[m[idx]].claim_order, current) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentElement !== target))) {
            target.actual_end_child = target.firstChild;
        }
        if (node !== target.actual_end_child) {
            target.insertBefore(node, target.actual_end_child);
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target) {
        target.appendChild(node);
    }
}
function insert(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function empty() {
    return text('');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function set_attributes(node, attributes) {
    // @ts-ignore
    const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
    for (const key in attributes) {
        if (attributes[key] == null) {
            node.removeAttribute(key);
        }
        else if (key === 'style') {
            node.style.cssText = attributes[key];
        }
        else if (key === '__value') {
            node.value = node[key] = attributes[key];
        }
        else if (descriptors[key] && descriptors[key].set) {
            node[key] = attributes[key];
        }
        else {
            attr(node, key, attributes[key]);
        }
    }
}
function children(element) {
    return Array.from(element.childNodes);
}
function set_data(text, data) {
    data = '' + data;
    if (text.wholeText !== data)
        text.data = data;
}
function set_style(node, key, value, important) {
    node.style.setProperty(key, value, important ? 'important' : '');
}
function custom_event(type, detail, bubbles = false) {
    const e = document.createEvent('CustomEvent');
    e.initCustomEvent(type, bubbles, false, detail);
    return e;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error('Function called outside component initialization');
    return current_component;
}
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
}
function onDestroy(fn) {
    get_current_component().$$.on_destroy.push(fn);
}
function createEventDispatcher() {
    const component = get_current_component();
    return (type, detail) => {
        const callbacks = component.$$.callbacks[type];
        if (callbacks) {
            // TODO are there situations where events could be dispatched
            // in a server (non-DOM) environment?
            const event = custom_event(type, detail);
            callbacks.slice().forEach(fn => {
                fn.call(component, event);
            });
        }
    };
}
function setContext(key, context) {
    get_current_component().$$.context.set(key, context);
}
function getContext(key) {
    return get_current_component().$$.context.get(key);
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function tick() {
    schedule_update();
    return resolved_promise;
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
let flushing = false;
const seen_callbacks = new Set();
function flush() {
    if (flushing)
        return;
    flushing = true;
    do {
        // first, call beforeUpdate functions
        // and update components
        for (let i = 0; i < dirty_components.length; i += 1) {
            const component = dirty_components[i];
            set_current_component(component);
            update(component.$$);
        }
        set_current_component(null);
        dirty_components.length = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    flushing = false;
    seen_callbacks.clear();
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
const outroing = new Set();
let outros;
function group_outros() {
    outros = {
        r: 0,
        c: [],
        p: outros // parent group
    };
}
function check_outros() {
    if (!outros.r) {
        run_all(outros.c);
    }
    outros = outros.p;
}
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
}

function handle_promise(promise, info) {
    const token = info.token = {};
    function update(type, index, key, value) {
        if (info.token !== token)
            return;
        info.resolved = value;
        let child_ctx = info.ctx;
        if (key !== undefined) {
            child_ctx = child_ctx.slice();
            child_ctx[key] = value;
        }
        const block = type && (info.current = type)(child_ctx);
        let needs_flush = false;
        if (info.block) {
            if (info.blocks) {
                info.blocks.forEach((block, i) => {
                    if (i !== index && block) {
                        group_outros();
                        transition_out(block, 1, 1, () => {
                            if (info.blocks[i] === block) {
                                info.blocks[i] = null;
                            }
                        });
                        check_outros();
                    }
                });
            }
            else {
                info.block.d(1);
            }
            block.c();
            transition_in(block, 1);
            block.m(info.mount(), info.anchor);
            needs_flush = true;
        }
        info.block = block;
        if (info.blocks)
            info.blocks[index] = block;
        if (needs_flush) {
            flush();
        }
    }
    if (is_promise(promise)) {
        const current_component = get_current_component();
        promise.then(value => {
            set_current_component(current_component);
            update(info.then, 1, info.value, value);
            set_current_component(null);
        }, error => {
            set_current_component(current_component);
            update(info.catch, 2, info.error, error);
            set_current_component(null);
            if (!info.hasCatch) {
                throw error;
            }
        });
        // if we previously had a then/catch block, destroy it
        if (info.current !== info.pending) {
            update(info.pending, 0);
            return true;
        }
    }
    else {
        if (info.current !== info.then) {
            update(info.then, 1, info.value, promise);
            return true;
        }
        info.resolved = promise;
    }
}
function update_await_block_branch(info, ctx, dirty) {
    const child_ctx = ctx.slice();
    const { resolved } = info;
    if (info.current === info.then) {
        child_ctx[info.value] = resolved;
    }
    if (info.current === info.catch) {
        child_ctx[info.error] = resolved;
    }
    info.block.p(child_ctx, dirty);
}

function get_spread_update(levels, updates) {
    const update = {};
    const to_null_out = {};
    const accounted_for = { $$scope: 1 };
    let i = levels.length;
    while (i--) {
        const o = levels[i];
        const n = updates[i];
        if (n) {
            for (const key in o) {
                if (!(key in n))
                    to_null_out[key] = 1;
            }
            for (const key in n) {
                if (!accounted_for[key]) {
                    update[key] = n[key];
                    accounted_for[key] = 1;
                }
            }
            levels[i] = n;
        }
        else {
            for (const key in o) {
                accounted_for[key] = 1;
            }
        }
    }
    for (const key in to_null_out) {
        if (!(key in update))
            update[key] = undefined;
    }
    return update;
}
function get_spread_object(spread_props) {
    return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
}
function create_component(block) {
    block && block.c();
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, on_mount, on_destroy, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: null,
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(parent_component ? parent_component.$$.context : options.context || []),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false
    };
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

const subscriber_queue = [];
/**
 * Creates a `Readable` store that allows reading by subscription.
 * @param value initial value
 * @param {StartStopNotifier}start start and stop notifications for subscriptions
 */
function readable(value, start) {
    return {
        subscribe: writable(value, start).subscribe
    };
}
/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 * @param {*=}value initial value
 * @param {StartStopNotifier=}start start and stop notifications for subscriptions
 */
function writable(value, start = noop) {
    let stop;
    const subscribers = [];
    function set(new_value) {
        if (safe_not_equal(value, new_value)) {
            value = new_value;
            if (stop) { // store is ready
                const run_queue = !subscriber_queue.length;
                for (let i = 0; i < subscribers.length; i += 1) {
                    const s = subscribers[i];
                    s[1]();
                    subscriber_queue.push(s, value);
                }
                if (run_queue) {
                    for (let i = 0; i < subscriber_queue.length; i += 2) {
                        subscriber_queue[i][0](subscriber_queue[i + 1]);
                    }
                    subscriber_queue.length = 0;
                }
            }
        }
    }
    function update(fn) {
        set(fn(value));
    }
    function subscribe(run, invalidate = noop) {
        const subscriber = [run, invalidate];
        subscribers.push(subscriber);
        if (subscribers.length === 1) {
            stop = start(set) || noop;
        }
        run(value);
        return () => {
            const index = subscribers.indexOf(subscriber);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
            if (subscribers.length === 0) {
                stop();
                stop = null;
            }
        };
    }
    return { set, update, subscribe };
}
function derived(stores, fn, initial_value) {
    const single = !Array.isArray(stores);
    const stores_array = single
        ? [stores]
        : stores;
    const auto = fn.length < 2;
    return readable(initial_value, (set) => {
        let inited = false;
        const values = [];
        let pending = 0;
        let cleanup = noop;
        const sync = () => {
            if (pending) {
                return;
            }
            cleanup();
            const result = fn(single ? values[0] : values, set);
            if (auto) {
                set(result);
            }
            else {
                cleanup = is_function(result) ? result : noop;
            }
        };
        const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
            values[i] = value;
            pending &= ~(1 << i);
            if (inited) {
                sync();
            }
        }, () => {
            pending |= (1 << i);
        }));
        inited = true;
        sync();
        return function stop() {
            run_all(unsubscribers);
            cleanup();
        };
    });
}

/*
 * Adapted from https://github.com/reach/router/blob/b60e6dd781d5d3a4bdaaf4de665649c0f6a7e78d/src/lib/utils.js
 *
 * https://github.com/reach/router/blob/master/LICENSE
 */

const isUndefined = value => typeof value === "undefined";

const isFunction = value => typeof value === "function";

const isNumber = value => typeof value === "number";

/**
 * Decides whether a given `event` should result in a navigation or not.
 * @param {object} event
 */
function shouldNavigate(event) {
	return (
		!event.defaultPrevented &&
		event.button === 0 &&
		!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
	);
}

function createCounter() {
	let i = 0;
	/**
	 * Returns an id and increments the internal state
	 * @returns {number}
	 */
	return () => i++;
}

/**
 * Create a globally unique id
 *
 * @returns {string} An id
 */
function createGlobalId() {
	return Math.random().toString(36).substring(2);
}

const isSSR = typeof window === "undefined";

function addListener(target, type, handler) {
	target.addEventListener(type, handler);
	return () => target.removeEventListener(type, handler);
}

/*
 * Adapted from https://github.com/EmilTholin/svelte-routing
 *
 * https://github.com/EmilTholin/svelte-routing/blob/master/LICENSE
 */

const createKey = ctxName => `@@svnav-ctx__${ctxName}`;

// Use strings instead of objects, so different versions of
// svelte-navigator can potentially still work together
const LOCATION = createKey("LOCATION");
const ROUTER = createKey("ROUTER");
const ROUTE = createKey("ROUTE");
const ROUTE_PARAMS = createKey("ROUTE_PARAMS");
const FOCUS_ELEM = createKey("FOCUS_ELEM");

const paramRegex = /^:(.+)/;

/**
 * Check if `string` starts with `search`
 * @param {string} string
 * @param {string} search
 * @return {boolean}
 */
const startsWith = (string, search) =>
	string.substr(0, search.length) === search;

/**
 * Check if `segment` is a root segment
 * @param {string} segment
 * @return {boolean}
 */
const isRootSegment = segment => segment === "";

/**
 * Check if `segment` is a dynamic segment
 * @param {string} segment
 * @return {boolean}
 */
const isDynamic = segment => paramRegex.test(segment);

/**
 * Check if `segment` is a splat
 * @param {string} segment
 * @return {boolean}
 */
const isSplat = segment => segment[0] === "*";

/**
 * Strip potention splat and splatname of the end of a path
 * @param {string} str
 * @return {string}
 */
const stripSplat = str => str.replace(/\*.*$/, "");

/**
 * Strip `str` of potential start and end `/`
 * @param {string} str
 * @return {string}
 */
const stripSlashes = str => str.replace(/(^\/+|\/+$)/g, "");

/**
 * Split up the URI into segments delimited by `/`
 * @param {string} uri
 * @return {string[]}
 */
function segmentize(uri, filterFalsy = false) {
	const segments = stripSlashes(uri).split("/");
	return filterFalsy ? segments.filter(Boolean) : segments;
}

/**
 * Add the query to the pathname if a query is given
 * @param {string} pathname
 * @param {string} [query]
 * @return {string}
 */
const addQuery = (pathname, query) =>
	pathname + (query ? `?${query}` : "");

/**
 * Normalizes a basepath
 *
 * @param {string} path
 * @returns {string}
 *
 * @example
 * normalizePath("base/path/") // -> "/base/path"
 */
const normalizePath = path => `/${stripSlashes(path)}`;

/**
 * Joins and normalizes multiple path fragments
 *
 * @param {...string} pathFragments
 * @returns {string}
 */
function join(...pathFragments) {
	const joinFragment = fragment => segmentize(fragment, true).join("/");
	const joinedSegments = pathFragments.map(joinFragment).join("/");
	return normalizePath(joinedSegments);
}

// We start from 1 here, so we can check if an origin id has been passed
// by using `originId || <fallback>`
const LINK_ID = 1;
const ROUTE_ID = 2;
const ROUTER_ID = 3;
const USE_FOCUS_ID = 4;
const USE_LOCATION_ID = 5;
const USE_MATCH_ID = 6;
const USE_NAVIGATE_ID = 7;
const USE_PARAMS_ID = 8;
const USE_RESOLVABLE_ID = 9;
const USE_RESOLVE_ID = 10;
const NAVIGATE_ID = 11;

const labels = {
	[LINK_ID]: "Link",
	[ROUTE_ID]: "Route",
	[ROUTER_ID]: "Router",
	[USE_FOCUS_ID]: "useFocus",
	[USE_LOCATION_ID]: "useLocation",
	[USE_MATCH_ID]: "useMatch",
	[USE_NAVIGATE_ID]: "useNavigate",
	[USE_PARAMS_ID]: "useParams",
	[USE_RESOLVABLE_ID]: "useResolvable",
	[USE_RESOLVE_ID]: "useResolve",
	[NAVIGATE_ID]: "navigate",
};

const createLabel = labelId => labels[labelId];

function createIdentifier(labelId, props) {
	let attr;
	if (labelId === ROUTE_ID) {
		attr = props.path ? `path="${props.path}"` : "default";
	} else if (labelId === LINK_ID) {
		attr = `to="${props.to}"`;
	} else if (labelId === ROUTER_ID) {
		attr = `basepath="${props.basepath || ""}"`;
	}
	return `<${createLabel(labelId)} ${attr || ""} />`;
}

function createMessage(labelId, message, props, originId) {
	const origin = props && createIdentifier(originId || labelId, props);
	const originMsg = origin ? `\n\nOccurred in: ${origin}` : "";
	const label = createLabel(labelId);
	const msg = isFunction(message) ? message(label) : message;
	return `<${label}> ${msg}${originMsg}`;
}

const createMessageHandler = handler => (...args) =>
	handler(createMessage(...args));

const fail = createMessageHandler(message => {
	throw new Error(message);
});

// eslint-disable-next-line no-console
const warn = createMessageHandler(console.warn);

const SEGMENT_POINTS = 4;
const STATIC_POINTS = 3;
const DYNAMIC_POINTS = 2;
const SPLAT_PENALTY = 1;
const ROOT_POINTS = 1;

/**
 * Score a route depending on how its individual segments look
 * @param {object} route
 * @param {number} index
 * @return {object}
 */
function rankRoute(route, index) {
	const score = route.default
		? 0
		: segmentize(route.fullPath).reduce((acc, segment) => {
				let nextScore = acc;
				nextScore += SEGMENT_POINTS;

				if (isRootSegment(segment)) {
					nextScore += ROOT_POINTS;
				} else if (isDynamic(segment)) {
					nextScore += DYNAMIC_POINTS;
				} else if (isSplat(segment)) {
					nextScore -= SEGMENT_POINTS + SPLAT_PENALTY;
				} else {
					nextScore += STATIC_POINTS;
				}

				return nextScore;
		  }, 0);

	return { route, score, index };
}

/**
 * Give a score to all routes and sort them on that
 * @param {object[]} routes
 * @return {object[]}
 */
function rankRoutes(routes) {
	return (
		routes
			.map(rankRoute)
			// If two routes have the exact same score, we go by index instead
			.sort((a, b) => {
				if (a.score < b.score) {
					return 1;
				}
				if (a.score > b.score) {
					return -1;
				}
				return a.index - b.index;
			})
	);
}

/**
 * Ranks and picks the best route to match. Each segment gets the highest
 * amount of points, then the type of segment gets an additional amount of
 * points where
 *
 *  static > dynamic > splat > root
 *
 * This way we don't have to worry about the order of our routes, let the
 * computers do it.
 *
 * A route looks like this
 *
 *  { fullPath, default, value }
 *
 * And a returned match looks like:
 *
 *  { route, params, uri }
 *
 * @param {object[]} routes
 * @param {string} uri
 * @return {?object}
 */
function pick(routes, uri) {
	let bestMatch;
	let defaultMatch;

	const [uriPathname] = uri.split("?");
	const uriSegments = segmentize(uriPathname);
	const isRootUri = uriSegments[0] === "";
	const ranked = rankRoutes(routes);

	for (let i = 0, l = ranked.length; i < l; i++) {
		const { route } = ranked[i];
		let missed = false;
		const params = {};

		// eslint-disable-next-line no-shadow
		const createMatch = uri => ({ ...route, params, uri });

		if (route.default) {
			defaultMatch = createMatch(uri);
			continue;
		}

		const routeSegments = segmentize(route.fullPath);
		const max = Math.max(uriSegments.length, routeSegments.length);
		let index = 0;

		for (; index < max; index++) {
			const routeSegment = routeSegments[index];
			const uriSegment = uriSegments[index];

			if (!isUndefined(routeSegment) && isSplat(routeSegment)) {
				// Hit a splat, just grab the rest, and return a match
				// uri:   /files/documents/work
				// route: /files/* or /files/*splatname
				const splatName = routeSegment === "*" ? "*" : routeSegment.slice(1);

				params[splatName] = uriSegments
					.slice(index)
					.map(decodeURIComponent)
					.join("/");
				break;
			}

			if (isUndefined(uriSegment)) {
				// URI is shorter than the route, no match
				// uri:   /users
				// route: /users/:userId
				missed = true;
				break;
			}

			const dynamicMatch = paramRegex.exec(routeSegment);

			if (dynamicMatch && !isRootUri) {
				const value = decodeURIComponent(uriSegment);
				params[dynamicMatch[1]] = value;
			} else if (routeSegment !== uriSegment) {
				// Current segments don't match, not dynamic, not splat, so no match
				// uri:   /users/123/settings
				// route: /users/:id/profile
				missed = true;
				break;
			}
		}

		if (!missed) {
			bestMatch = createMatch(join(...uriSegments.slice(0, index)));
			break;
		}
	}

	return bestMatch || defaultMatch || null;
}

/**
 * Check if the `route.fullPath` matches the `uri`.
 * @param {Object} route
 * @param {string} uri
 * @return {?object}
 */
function match(route, uri) {
	return pick([route], uri);
}

/**
 * Resolve URIs as though every path is a directory, no files. Relative URIs
 * in the browser can feel awkward because not only can you be "in a directory",
 * you can be "at a file", too. For example:
 *
 *  browserSpecResolve('foo', '/bar/') => /bar/foo
 *  browserSpecResolve('foo', '/bar') => /foo
 *
 * But on the command line of a file system, it's not as complicated. You can't
 * `cd` from a file, only directories. This way, links have to know less about
 * their current path. To go deeper you can do this:
 *
 *  <Link to="deeper"/>
 *  // instead of
 *  <Link to=`{${props.uri}/deeper}`/>
 *
 * Just like `cd`, if you want to go deeper from the command line, you do this:
 *
 *  cd deeper
 *  # not
 *  cd $(pwd)/deeper
 *
 * By treating every path as a directory, linking to relative paths should
 * require less contextual information and (fingers crossed) be more intuitive.
 * @param {string} to
 * @param {string} base
 * @return {string}
 */
function resolve(to, base) {
	// /foo/bar, /baz/qux => /foo/bar
	if (startsWith(to, "/")) {
		return to;
	}

	const [toPathname, toQuery] = to.split("?");
	const [basePathname] = base.split("?");
	const toSegments = segmentize(toPathname);
	const baseSegments = segmentize(basePathname);

	// ?a=b, /users?b=c => /users?a=b
	if (toSegments[0] === "") {
		return addQuery(basePathname, toQuery);
	}

	// profile, /users/789 => /users/789/profile
	if (!startsWith(toSegments[0], ".")) {
		const pathname = baseSegments.concat(toSegments).join("/");
		return addQuery((basePathname === "/" ? "" : "/") + pathname, toQuery);
	}

	// ./       , /users/123 => /users/123
	// ../      , /users/123 => /users
	// ../..    , /users/123 => /
	// ../../one, /a/b/c/d   => /a/b/one
	// .././one , /a/b/c/d   => /a/b/c/one
	const allSegments = baseSegments.concat(toSegments);
	const segments = [];

	allSegments.forEach(segment => {
		if (segment === "..") {
			segments.pop();
		} else if (segment !== ".") {
			segments.push(segment);
		}
	});

	return addQuery(`/${segments.join("/")}`, toQuery);
}

/**
 * Normalizes a location for consumption by `Route` children and the `Router`.
 * It removes the apps basepath from the pathname
 * and sets default values for `search` and `hash` properties.
 *
 * @param {Object} location The current global location supplied by the history component
 * @param {string} basepath The applications basepath (i.e. when serving from a subdirectory)
 *
 * @returns The normalized location
 */
function normalizeLocation(location, basepath) {
	const { pathname, hash = "", search = "", state } = location;
	const baseSegments = segmentize(basepath, true);
	const pathSegments = segmentize(pathname, true);
	while (baseSegments.length) {
		if (baseSegments[0] !== pathSegments[0]) {
			fail(
				ROUTER_ID,
				`Invalid state: All locations must begin with the basepath "${basepath}", found "${pathname}"`,
			);
		}
		baseSegments.shift();
		pathSegments.shift();
	}
	return {
		pathname: join(...pathSegments),
		hash,
		search,
		state,
	};
}

const normalizeUrlFragment = frag => (frag.length === 1 ? "" : frag);

/**
 * Creates a location object from an url.
 * It is used to create a location from the url prop used in SSR
 *
 * @param {string} url The url string (e.g. "/path/to/somewhere")
 *
 * @returns {{ pathname: string; search: string; hash: string }} The location
 */
function createLocation(url) {
	const searchIndex = url.indexOf("?");
	const hashIndex = url.indexOf("#");
	const hasSearchIndex = searchIndex !== -1;
	const hasHashIndex = hashIndex !== -1;
	const hash = hasHashIndex ? normalizeUrlFragment(url.substr(hashIndex)) : "";
	const pathnameAndSearch = hasHashIndex ? url.substr(0, hashIndex) : url;
	const search = hasSearchIndex
		? normalizeUrlFragment(pathnameAndSearch.substr(searchIndex))
		: "";
	const pathname = hasSearchIndex
		? pathnameAndSearch.substr(0, searchIndex)
		: pathnameAndSearch;
	return { pathname, search, hash };
}

/**
 * Resolves a link relative to the parent Route and the Routers basepath.
 *
 * @param {string} path The given path, that will be resolved
 * @param {string} routeBase The current Routes base path
 * @param {string} appBase The basepath of the app. Used, when serving from a subdirectory
 * @returns {string} The resolved path
 *
 * @example
 * resolveLink("relative", "/routeBase", "/") // -> "/routeBase/relative"
 * resolveLink("/absolute", "/routeBase", "/") // -> "/absolute"
 * resolveLink("relative", "/routeBase", "/base") // -> "/base/routeBase/relative"
 * resolveLink("/absolute", "/routeBase", "/base") // -> "/base/absolute"
 */
function resolveLink(path, routeBase, appBase) {
	return join(appBase, resolve(path, routeBase));
}

/**
 * Get the uri for a Route, by matching it against the current location.
 *
 * @param {string} routePath The Routes resolved path
 * @param {string} pathname The current locations pathname
 */
function extractBaseUri(routePath, pathname) {
	const fullPath = normalizePath(stripSplat(routePath));
	const baseSegments = segmentize(fullPath, true);
	const pathSegments = segmentize(pathname, true).slice(0, baseSegments.length);
	const routeMatch = match({ fullPath }, join(...pathSegments));
	return routeMatch && routeMatch.uri;
}

/*
 * Adapted from https://github.com/reach/router/blob/b60e6dd781d5d3a4bdaaf4de665649c0f6a7e78d/src/lib/history.js
 *
 * https://github.com/reach/router/blob/master/LICENSE
 */

const POP = "POP";
const PUSH = "PUSH";
const REPLACE = "REPLACE";

function getLocation(source) {
	return {
		...source.location,
		pathname: encodeURI(decodeURI(source.location.pathname)),
		state: source.history.state,
		_key: (source.history.state && source.history.state._key) || "initial",
	};
}

function createHistory(source) {
	let listeners = [];
	let location = getLocation(source);
	let action = POP;

	const notifyListeners = (listenerFns = listeners) =>
		listenerFns.forEach(listener => listener({ location, action }));

	return {
		get location() {
			return location;
		},
		listen(listener) {
			listeners.push(listener);

			const popstateListener = () => {
				location = getLocation(source);
				action = POP;
				notifyListeners([listener]);
			};

			// Call listener when it is registered
			notifyListeners([listener]);

			const unlisten = addListener(source, "popstate", popstateListener);
			return () => {
				unlisten();
				listeners = listeners.filter(fn => fn !== listener);
			};
		},
		/**
		 * Navigate to a new absolute route.
		 *
		 * @param {string|number} to The path to navigate to.
		 *
		 * If `to` is a number we will navigate to the stack entry index + `to`
		 * (-> `navigate(-1)`, is equivalent to hitting the back button of the browser)
		 * @param {Object} options
		 * @param {*} [options.state] The state will be accessible through `location.state`
		 * @param {boolean} [options.replace=false] Replace the current entry in the history
		 * stack, instead of pushing on a new one
		 */
		navigate(to, options) {
			const { state = {}, replace = false } = options || {};
			action = replace ? REPLACE : PUSH;
			if (isNumber(to)) {
				if (options) {
					warn(
						NAVIGATE_ID,
						"Navigation options (state or replace) are not supported, " +
							"when passing a number as the first argument to navigate. " +
							"They are ignored.",
					);
				}
				action = POP;
				source.history.go(to);
			} else {
				const keyedState = { ...state, _key: createGlobalId() };
				// try...catch iOS Safari limits to 100 pushState calls
				try {
					source.history[replace ? "replaceState" : "pushState"](
						keyedState,
						"",
						to,
					);
				} catch (e) {
					source.location[replace ? "replace" : "assign"](to);
				}
			}

			location = getLocation(source);
			notifyListeners();
		},
	};
}

function createStackFrame(state, uri) {
	return { ...createLocation(uri), state };
}

// Stores history entries in memory for testing or other platforms like Native
function createMemorySource(initialPathname = "/") {
	let index = 0;
	let stack = [createStackFrame(null, initialPathname)];

	return {
		// This is just for testing...
		get entries() {
			return stack;
		},
		get location() {
			return stack[index];
		},
		addEventListener() {},
		removeEventListener() {},
		history: {
			get state() {
				return stack[index].state;
			},
			pushState(state, title, uri) {
				index++;
				// Throw away anything in the stack with an index greater than the current index.
				// This happens, when we go back using `go(-n)`. The index is now less than `stack.length`.
				// If we call `go(+n)` the stack entries with an index greater than the current index can
				// be reused.
				// However, if we navigate to a path, instead of a number, we want to create a new branch
				// of navigation.
				stack = stack.slice(0, index);
				stack.push(createStackFrame(state, uri));
			},
			replaceState(state, title, uri) {
				stack[index] = createStackFrame(state, uri);
			},
			go(to) {
				const newIndex = index + to;
				if (newIndex < 0 || newIndex > stack.length - 1) {
					return;
				}
				index = newIndex;
			},
		},
	};
}

// Global history uses window.history as the source if available,
// otherwise a memory history
const canUseDOM = !!(
	!isSSR &&
	window.document &&
	window.document.createElement
);
// Use memory history in iframes (for example in Svelte REPL)
const isEmbeddedPage = !isSSR && window.location.origin === "null";
const globalHistory = createHistory(
	canUseDOM && !isEmbeddedPage ? window : createMemorySource(),
);

// We need to keep the focus candidate in a separate file, so svelte does
// not update, when we mutate it.
// Also, we need a single global reference, because taking focus needs to
// work globally, even if we have multiple top level routers
// eslint-disable-next-line import/no-mutable-exports
let focusCandidate = null;

// eslint-disable-next-line import/no-mutable-exports
let initialNavigation = true;

/**
 * Check if RouterA is above RouterB in the document
 * @param {number} routerIdA The first Routers id
 * @param {number} routerIdB The second Routers id
 */
function isAbove(routerIdA, routerIdB) {
	const routerMarkers = document.querySelectorAll("[data-svnav-router]");
	for (let i = 0; i < routerMarkers.length; i++) {
		const node = routerMarkers[i];
		const currentId = Number(node.dataset.svnavRouter);
		if (currentId === routerIdA) return true;
		if (currentId === routerIdB) return false;
	}
	return false;
}

/**
 * Check if a Route candidate is the best choice to move focus to,
 * and store the best match.
 * @param {{
     level: number;
     routerId: number;
     route: {
       id: number;
       focusElement: import("svelte/store").Readable<Promise<Element>|null>;
     }
   }} item A Route candidate, that updated and is visible after a navigation
 */
function pushFocusCandidate(item) {
	if (
		// Best candidate if it's the only candidate...
		!focusCandidate ||
		// Route is nested deeper, than previous candidate
		// -> Route change was triggered in the deepest affected
		// Route, so that's were focus should move to
		item.level > focusCandidate.level ||
		// If the level is identical, we want to focus the first Route in the document,
		// so we pick the first Router lookin from page top to page bottom.
		(item.level === focusCandidate.level &&
			isAbove(item.routerId, focusCandidate.routerId))
	) {
		focusCandidate = item;
	}
}

/**
 * Reset the focus candidate.
 */
function clearFocusCandidate() {
	focusCandidate = null;
}

function initialNavigationOccurred() {
	initialNavigation = false;
}

/*
 * `focus` Adapted from https://github.com/oaf-project/oaf-side-effects/blob/master/src/index.ts
 *
 * https://github.com/oaf-project/oaf-side-effects/blob/master/LICENSE
 */
function focus(elem) {
	if (!elem) return false;
	const TABINDEX = "tabindex";
	try {
		if (!elem.hasAttribute(TABINDEX)) {
			elem.setAttribute(TABINDEX, "-1");
			let unlisten;
			// We remove tabindex after blur to avoid weird browser behavior
			// where a mouse click can activate elements with tabindex="-1".
			const blurListener = () => {
				elem.removeAttribute(TABINDEX);
				unlisten();
			};
			unlisten = addListener(elem, "blur", blurListener);
		}
		elem.focus();
		return document.activeElement === elem;
	} catch (e) {
		// Apparently trying to focus a disabled element in IE can throw.
		// See https://stackoverflow.com/a/1600194/2476884
		return false;
	}
}

function isEndMarker(elem, id) {
	return Number(elem.dataset.svnavRouteEnd) === id;
}

function isHeading(elem) {
	return /^H[1-6]$/i.test(elem.tagName);
}

function query(selector, parent = document) {
	return parent.querySelector(selector);
}

function queryHeading(id) {
	const marker = query(`[data-svnav-route-start="${id}"]`);
	let current = marker.nextElementSibling;
	while (!isEndMarker(current, id)) {
		if (isHeading(current)) {
			return current;
		}
		const heading = query("h1,h2,h3,h4,h5,h6", current);
		if (heading) {
			return heading;
		}
		current = current.nextElementSibling;
	}
	return null;
}

function handleFocus(route) {
	Promise.resolve(get_store_value(route.focusElement)).then(elem => {
		const focusElement = elem || queryHeading(route.id);
		if (!focusElement) {
			warn(
				ROUTER_ID,
				"Could not find an element to focus. " +
					"You should always render a header for accessibility reasons, " +
					'or set a custom focus element via the "useFocus" hook. ' +
					"If you don't want this Route or Router to manage focus, " +
					'pass "primary={false}" to it.',
				route,
				ROUTE_ID,
			);
		}
		const headingFocused = focus(focusElement);
		if (headingFocused) return;
		focus(document.documentElement);
	});
}

const createTriggerFocus = (a11yConfig, announcementText, location) => (
	manageFocus,
	announceNavigation,
) =>
	// Wait until the dom is updated, so we can look for headings
	tick().then(() => {
		if (!focusCandidate || initialNavigation) {
			initialNavigationOccurred();
			return;
		}
		if (manageFocus) {
			handleFocus(focusCandidate.route);
		}
		if (a11yConfig.announcements && announceNavigation) {
			const { path, fullPath, meta, params, uri } = focusCandidate.route;
			const announcementMessage = a11yConfig.createAnnouncement(
				{ path, fullPath, meta, params, uri },
				get_store_value(location),
			);
			Promise.resolve(announcementMessage).then(message => {
				announcementText.set(message);
			});
		}
		clearFocusCandidate();
	});

const visuallyHiddenStyle =
	"position:fixed;" +
	"top:-1px;" +
	"left:0;" +
	"width:1px;" +
	"height:1px;" +
	"padding:0;" +
	"overflow:hidden;" +
	"clip:rect(0,0,0,0);" +
	"white-space:nowrap;" +
	"border:0;";

/* src\Router.svelte generated by Svelte v3.31.2 */

function create_if_block(ctx) {
	let div;
	let t;

	return {
		c() {
			div = element("div");
			t = text(/*$announcementText*/ ctx[0]);
			attr(div, "role", "status");
			attr(div, "aria-atomic", "true");
			attr(div, "aria-live", "polite");
			attr(div, "style", visuallyHiddenStyle);
		},
		m(target, anchor) {
			insert(target, div, anchor);
			append(div, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*$announcementText*/ 1) set_data(t, /*$announcementText*/ ctx[0]);
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

function create_fragment$3(ctx) {
	let div;
	let t0;
	let t1;
	let if_block_anchor;
	let current;
	const default_slot_template = /*#slots*/ ctx[20].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[19], null);
	let if_block = /*isTopLevelRouter*/ ctx[2] && /*manageFocus*/ ctx[4] && /*a11yConfig*/ ctx[1].announcements && create_if_block(ctx);

	return {
		c() {
			div = element("div");
			t0 = space();
			if (default_slot) default_slot.c();
			t1 = space();
			if (if_block) if_block.c();
			if_block_anchor = empty();
			set_style(div, "display", "none");
			attr(div, "aria-hidden", "true");
			attr(div, "data-svnav-router", /*routerId*/ ctx[3]);
		},
		m(target, anchor) {
			insert(target, div, anchor);
			insert(target, t0, anchor);

			if (default_slot) {
				default_slot.m(target, anchor);
			}

			insert(target, t1, anchor);
			if (if_block) if_block.m(target, anchor);
			insert(target, if_block_anchor, anchor);
			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && dirty[0] & /*$$scope*/ 524288) {
					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[19], dirty, null, null);
				}
			}

			if (/*isTopLevelRouter*/ ctx[2] && /*manageFocus*/ ctx[4] && /*a11yConfig*/ ctx[1].announcements) if_block.p(ctx, dirty);
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div);
			if (detaching) detach(t0);
			if (default_slot) default_slot.d(detaching);
			if (detaching) detach(t1);
			if (if_block) if_block.d(detaching);
			if (detaching) detach(if_block_anchor);
		}
	};
}

const createId = createCounter();
const defaultBasepath = "/";

function instance$2($$self, $$props, $$invalidate) {
	let $location;
	let $routes;
	let $prevLocation;
	let $activeRoute;
	let $announcementText;
	let { $$slots: slots = {}, $$scope } = $$props;
	let { basepath = defaultBasepath } = $$props;
	let { url = null } = $$props;
	let { history = globalHistory } = $$props;
	let { primary = true } = $$props;
	let { a11y = {} } = $$props;

	const a11yConfig = {
		createAnnouncement: route => `Navigated to ${route.uri}`,
		announcements: true,
		...a11y
	};

	// Remember the initial `basepath`, so we can fire a warning
	// when the user changes it later
	const initialBasepath = basepath;

	const normalizedBasepath = normalizePath(basepath);
	const locationContext = getContext(LOCATION);
	const routerContext = getContext(ROUTER);
	const isTopLevelRouter = !locationContext;
	const routerId = createId();
	const manageFocus = primary && !(routerContext && !routerContext.manageFocus);
	const announcementText = writable("");
	component_subscribe($$self, announcementText, value => $$invalidate(0, $announcementText = value));
	const routes = writable([]);
	component_subscribe($$self, routes, value => $$invalidate(16, $routes = value));
	const activeRoute = writable(null);
	component_subscribe($$self, activeRoute, value => $$invalidate(18, $activeRoute = value));

	// Used in SSR to synchronously set that a Route is active.
	let hasActiveRoute = false;

	// Nesting level of router.
	// We will need this to identify sibling routers, when moving
	// focus on navigation, so we can focus the first possible router
	const level = isTopLevelRouter ? 0 : routerContext.level + 1;

	// If we're running an SSR we force the location to the `url` prop
	const getInitialLocation = () => normalizeLocation(isSSR ? createLocation(url) : history.location, normalizedBasepath);

	const location = isTopLevelRouter
	? writable(getInitialLocation())
	: locationContext;

	component_subscribe($$self, location, value => $$invalidate(15, $location = value));
	const prevLocation = writable($location);
	component_subscribe($$self, prevLocation, value => $$invalidate(17, $prevLocation = value));
	const triggerFocus = createTriggerFocus(a11yConfig, announcementText, location);
	const createRouteFilter = routeId => routeList => routeList.filter(routeItem => routeItem.id !== routeId);

	function registerRoute(route) {
		if (isSSR) {
			// In SSR we should set the activeRoute immediately if it is a match.
			// If there are more Routes being registered after a match is found,
			// we just skip them.
			if (hasActiveRoute) {
				return;
			}

			const matchingRoute = match(route, $location.pathname);

			if (matchingRoute) {
				hasActiveRoute = true;

				// Return the match in SSR mode, so the matched Route can use it immediatly.
				// Waiting for activeRoute to update does not work, because it updates
				// after the Route is initialized
				return matchingRoute; // eslint-disable-line consistent-return
			}
		} else {
			routes.update(prevRoutes => {
				// Remove an old version of the updated route,
				// before pushing the new version
				const nextRoutes = createRouteFilter(route.id)(prevRoutes);

				nextRoutes.push(route);
				return nextRoutes;
			});
		}
	}

	function unregisterRoute(routeId) {
		routes.update(createRouteFilter(routeId));
	}

	if (!isTopLevelRouter && basepath !== defaultBasepath) {
		warn(ROUTER_ID, "Only top-level Routers can have a \"basepath\" prop. It is ignored.", { basepath });
	}

	if (isTopLevelRouter) {
		// The topmost Router in the tree is responsible for updating
		// the location store and supplying it through context.
		onMount(() => {
			const unlisten = history.listen(changedHistory => {
				const normalizedLocation = normalizeLocation(changedHistory.location, normalizedBasepath);
				prevLocation.set($location);
				location.set(normalizedLocation);
			});

			return unlisten;
		});

		setContext(LOCATION, location);
	}

	setContext(ROUTER, {
		activeRoute,
		registerRoute,
		unregisterRoute,
		manageFocus,
		level,
		id: routerId,
		history: isTopLevelRouter ? history : routerContext.history,
		basepath: isTopLevelRouter
		? normalizedBasepath
		: routerContext.basepath
	});

	$$self.$$set = $$props => {
		if ("basepath" in $$props) $$invalidate(10, basepath = $$props.basepath);
		if ("url" in $$props) $$invalidate(11, url = $$props.url);
		if ("history" in $$props) $$invalidate(12, history = $$props.history);
		if ("primary" in $$props) $$invalidate(13, primary = $$props.primary);
		if ("a11y" in $$props) $$invalidate(14, a11y = $$props.a11y);
		if ("$$scope" in $$props) $$invalidate(19, $$scope = $$props.$$scope);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty[0] & /*basepath*/ 1024) {
			 if (basepath !== initialBasepath) {
				warn(ROUTER_ID, "You cannot change the \"basepath\" prop. It is ignored.");
			}
		}

		if ($$self.$$.dirty[0] & /*$routes, $location*/ 98304) {
			// This reactive statement will be run when the Router is created
			// when there are no Routes and then again the following tick, so it
			// will not find an active Route in SSR and in the browser it will only
			// pick an active Route after all Routes have been registered.
			 {
				const bestMatch = pick($routes, $location.pathname);
				activeRoute.set(bestMatch);
			}
		}

		if ($$self.$$.dirty[0] & /*$location, $prevLocation*/ 163840) {
			// Manage focus and announce navigation to screen reader users
			 {
				if (isTopLevelRouter) {
					const hasHash = !!$location.hash;

					// When a hash is present in the url, we skip focus management, because
					// focusing a different element will prevent in-page jumps (See #3)
					const shouldManageFocus = !hasHash && manageFocus;

					// We don't want to make an announcement, when the hash changes,
					// but the active route stays the same
					const announceNavigation = !hasHash || $location.pathname !== $prevLocation.pathname;

					triggerFocus(shouldManageFocus, announceNavigation);
				}
			}
		}

		if ($$self.$$.dirty[0] & /*$activeRoute*/ 262144) {
			// Queue matched Route, so top level Router can decide which Route to focus.
			// Non primary Routers should just be ignored
			 if (manageFocus && $activeRoute && $activeRoute.primary) {
				pushFocusCandidate({ level, routerId, route: $activeRoute });
			}
		}
	};

	return [
		$announcementText,
		a11yConfig,
		isTopLevelRouter,
		routerId,
		manageFocus,
		announcementText,
		routes,
		activeRoute,
		location,
		prevLocation,
		basepath,
		url,
		history,
		primary,
		a11y,
		$location,
		$routes,
		$prevLocation,
		$activeRoute,
		$$scope,
		slots
	];
}

class Router extends SvelteComponent {
	constructor(options) {
		super();

		init(
			this,
			options,
			instance$2,
			create_fragment$3,
			safe_not_equal,
			{
				basepath: 10,
				url: 11,
				history: 12,
				primary: 13,
				a11y: 14
			},
			[-1, -1]
		);
	}
}

/**
 * Check if a component or hook have been created outside of a
 * context providing component
 * @param {number} componentId
 * @param {*} props
 * @param {string?} ctxKey
 * @param {number?} ctxProviderId
 */
function usePreflightCheck(
	componentId,
	props,
	ctxKey = ROUTER,
	ctxProviderId = ROUTER_ID,
) {
	const ctx = getContext(ctxKey);
	if (!ctx) {
		fail(
			componentId,
			label =>
				`You cannot use ${label} outside of a ${createLabel(ctxProviderId)}.`,
			props,
		);
	}
}

const toReadonly = ctx => {
	const { subscribe } = getContext(ctx);
	return { subscribe };
};

/**
 * Access the current location via a readable store.
 * @returns {import("svelte/store").Readable<{
    pathname: string;
    search: string;
    hash: string;
    state: {};
  }>}
 *
 * @example
  ```html
  <script>
    import { useLocation } from "svelte-navigator";

    const location = useLocation();

    $: console.log($location);
    // {
    //   pathname: "/blog",
    //   search: "?id=123",
    //   hash: "#comments",
    //   state: {}
    // }
  </script>
  ```
 */
function useLocation() {
	usePreflightCheck(USE_LOCATION_ID);
	return toReadonly(LOCATION);
}

/**
 * @typedef {{
    path: string;
    fullPath: string;
    uri: string;
    params: {};
  }} RouteMatch
 */

/**
 * @typedef {import("svelte/store").Readable<RouteMatch|null>} RouteMatchStore
 */

/**
 * Access the history of top level Router.
 */
function useHistory() {
	const { history } = getContext(ROUTER);
	return history;
}

/**
 * Access the base of the parent Route.
 */
function useRouteBase() {
	const route = getContext(ROUTE);
	return route ? derived(route, _route => _route.base) : writable("/");
}

/**
 * Resolve a given link relative to the current `Route` and the `Router`s `basepath`.
 * It is used under the hood in `Link` and `useNavigate`.
 * You can use it to manually resolve links, when using the `link` or `links` actions.
 *
 * @returns {(path: string) => string}
 *
 * @example
  ```html
  <script>
    import { link, useResolve } from "svelte-navigator";

    const resolve = useResolve();
    // `resolvedLink` will be resolved relative to its parent Route
    // and the Routers `basepath`
    const resolvedLink = resolve("relativePath");
  </script>

  <a href={resolvedLink} use:link>Relative link</a>
  ```
 */
function useResolve() {
	usePreflightCheck(USE_RESOLVE_ID);
	const routeBase = useRouteBase();
	const { basepath: appBase } = getContext(ROUTER);
	/**
	 * Resolves the path relative to the current route and basepath.
	 *
	 * @param {string} path The path to resolve
	 * @returns {string} The resolved path
	 */
	const resolve = path => resolveLink(path, get_store_value(routeBase), appBase);
	return resolve;
}

/**
 * A hook, that returns a context-aware version of `navigate`.
 * It will automatically resolve the given link relative to the current Route.
 * It will also resolve a link against the `basepath` of the Router.
 *
 * @example
  ```html
  <!-- App.svelte -->
  <script>
    import { link, Route } from "svelte-navigator";
    import RouteComponent from "./RouteComponent.svelte";
  </script>

  <Router>
    <Route path="route1">
      <RouteComponent />
    </Route>
    <!-- ... -->
  </Router>

  <!-- RouteComponent.svelte -->
  <script>
    import { useNavigate } from "svelte-navigator";

    const navigate = useNavigate();
  </script>

  <button on:click="{() => navigate('relativePath')}">
    go to /route1/relativePath
  </button>
  <button on:click="{() => navigate('/absolutePath')}">
    go to /absolutePath
  </button>
  ```
  *
  * @example
  ```html
  <!-- App.svelte -->
  <script>
    import { link, Route } from "svelte-navigator";
    import RouteComponent from "./RouteComponent.svelte";
  </script>

  <Router basepath="/base">
    <Route path="route1">
      <RouteComponent />
    </Route>
    <!-- ... -->
  </Router>

  <!-- RouteComponent.svelte -->
  <script>
    import { useNavigate } from "svelte-navigator";

    const navigate = useNavigate();
  </script>

  <button on:click="{() => navigate('relativePath')}">
    go to /base/route1/relativePath
  </button>
  <button on:click="{() => navigate('/absolutePath')}">
    go to /base/absolutePath
  </button>
  ```
 */
function useNavigate() {
	usePreflightCheck(USE_NAVIGATE_ID);
	const resolve = useResolve();
	const { navigate } = useHistory();
	/**
	 * Navigate to a new route.
	 * Resolves the link relative to the current route and basepath.
	 *
	 * @param {string|number} to The path to navigate to.
	 *
	 * If `to` is a number we will navigate to the stack entry index + `to`
	 * (-> `navigate(-1)`, is equivalent to hitting the back button of the browser)
	 * @param {Object} options
	 * @param {*} [options.state]
	 * @param {boolean} [options.replace=false]
	 */
	const navigateRelative = (to, options) => {
		// If to is a number, we navigate to the target stack entry via `history.go`.
		// Otherwise resolve the link
		const target = isNumber(to) ? to : resolve(to);
		return navigate(target, options);
	};
	return navigateRelative;
}

/* src\Route.svelte generated by Svelte v3.31.2 */

const get_default_slot_changes = dirty => ({
	params: dirty & /*$params*/ 16,
	location: dirty & /*$location*/ 4
});

const get_default_slot_context = ctx => ({
	params: isSSR ? get_store_value(/*params*/ ctx[9]) : /*$params*/ ctx[4],
	location: /*$location*/ ctx[2],
	navigate: /*navigate*/ ctx[10]
});

// (97:0) {#if isActive}
function create_if_block$1(ctx) {
	let router;
	let current;

	router = new Router({
			props: {
				primary: /*primary*/ ctx[1],
				$$slots: { default: [create_default_slot$2] },
				$$scope: { ctx }
			}
		});

	return {
		c() {
			create_component(router.$$.fragment);
		},
		m(target, anchor) {
			mount_component(router, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const router_changes = {};
			if (dirty & /*primary*/ 2) router_changes.primary = /*primary*/ ctx[1];

			if (dirty & /*$$scope, component, $location, $params, $$restProps*/ 264213) {
				router_changes.$$scope = { dirty, ctx };
			}

			router.$set(router_changes);
		},
		i(local) {
			if (current) return;
			transition_in(router.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(router.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(router, detaching);
		}
	};
}

// (113:2) {:else}
function create_else_block(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[17].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[18], get_default_slot_context);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && dirty & /*$$scope, $params, $location*/ 262164) {
					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[18], dirty, get_default_slot_changes, get_default_slot_context);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

// (105:2) {#if component !== null}
function create_if_block_1(ctx) {
	let switch_instance;
	let switch_instance_anchor;
	let current;

	const switch_instance_spread_levels = [
		{ location: /*$location*/ ctx[2] },
		{ navigate: /*navigate*/ ctx[10] },
		isSSR ? get_store_value(/*params*/ ctx[9]) : /*$params*/ ctx[4],
		/*$$restProps*/ ctx[11]
	];

	var switch_value = /*component*/ ctx[0];

	function switch_props(ctx) {
		let switch_instance_props = {};

		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
		}

		return { props: switch_instance_props };
	}

	if (switch_value) {
		switch_instance = new switch_value(switch_props());
	}

	return {
		c() {
			if (switch_instance) create_component(switch_instance.$$.fragment);
			switch_instance_anchor = empty();
		},
		m(target, anchor) {
			if (switch_instance) {
				mount_component(switch_instance, target, anchor);
			}

			insert(target, switch_instance_anchor, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const switch_instance_changes = (dirty & /*$location, navigate, isSSR, get, params, $params, $$restProps*/ 3604)
			? get_spread_update(switch_instance_spread_levels, [
					dirty & /*$location*/ 4 && { location: /*$location*/ ctx[2] },
					dirty & /*navigate*/ 1024 && { navigate: /*navigate*/ ctx[10] },
					dirty & /*isSSR, get, params, $params*/ 528 && get_spread_object(isSSR ? get_store_value(/*params*/ ctx[9]) : /*$params*/ ctx[4]),
					dirty & /*$$restProps*/ 2048 && get_spread_object(/*$$restProps*/ ctx[11])
				])
			: {};

			if (switch_value !== (switch_value = /*component*/ ctx[0])) {
				if (switch_instance) {
					group_outros();
					const old_component = switch_instance;

					transition_out(old_component.$$.fragment, 1, 0, () => {
						destroy_component(old_component, 1);
					});

					check_outros();
				}

				if (switch_value) {
					switch_instance = new switch_value(switch_props());
					create_component(switch_instance.$$.fragment);
					transition_in(switch_instance.$$.fragment, 1);
					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
				} else {
					switch_instance = null;
				}
			} else if (switch_value) {
				switch_instance.$set(switch_instance_changes);
			}
		},
		i(local) {
			if (current) return;
			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
			current = true;
		},
		o(local) {
			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(switch_instance_anchor);
			if (switch_instance) destroy_component(switch_instance, detaching);
		}
	};
}

// (98:1) <Router {primary}>
function create_default_slot$2(ctx) {
	let current_block_type_index;
	let if_block;
	let if_block_anchor;
	let current;
	const if_block_creators = [create_if_block_1, create_else_block];
	const if_blocks = [];

	function select_block_type(ctx, dirty) {
		if (/*component*/ ctx[0] !== null) return 0;
		return 1;
	}

	current_block_type_index = select_block_type(ctx);
	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	return {
		c() {
			if_block.c();
			if_block_anchor = empty();
		},
		m(target, anchor) {
			if_blocks[current_block_type_index].m(target, anchor);
			insert(target, if_block_anchor, anchor);
			current = true;
		},
		p(ctx, dirty) {
			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);

			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(ctx, dirty);
			} else {
				group_outros();

				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});

				check_outros();
				if_block = if_blocks[current_block_type_index];

				if (!if_block) {
					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block.c();
				} else {
					if_block.p(ctx, dirty);
				}

				transition_in(if_block, 1);
				if_block.m(if_block_anchor.parentNode, if_block_anchor);
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o(local) {
			transition_out(if_block);
			current = false;
		},
		d(detaching) {
			if_blocks[current_block_type_index].d(detaching);
			if (detaching) detach(if_block_anchor);
		}
	};
}

function create_fragment$1$1(ctx) {
	let div0;
	let t0;
	let t1;
	let div1;
	let current;
	let if_block = /*isActive*/ ctx[3] && create_if_block$1(ctx);

	return {
		c() {
			div0 = element("div");
			t0 = space();
			if (if_block) if_block.c();
			t1 = space();
			div1 = element("div");
			set_style(div0, "display", "none");
			attr(div0, "aria-hidden", "true");
			attr(div0, "data-svnav-route-start", /*id*/ ctx[5]);
			set_style(div1, "display", "none");
			attr(div1, "aria-hidden", "true");
			attr(div1, "data-svnav-route-end", /*id*/ ctx[5]);
		},
		m(target, anchor) {
			insert(target, div0, anchor);
			insert(target, t0, anchor);
			if (if_block) if_block.m(target, anchor);
			insert(target, t1, anchor);
			insert(target, div1, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			if (/*isActive*/ ctx[3]) {
				if (if_block) {
					if_block.p(ctx, dirty);

					if (dirty & /*isActive*/ 8) {
						transition_in(if_block, 1);
					}
				} else {
					if_block = create_if_block$1(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(t1.parentNode, t1);
				}
			} else if (if_block) {
				group_outros();

				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});

				check_outros();
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o(local) {
			transition_out(if_block);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div0);
			if (detaching) detach(t0);
			if (if_block) if_block.d(detaching);
			if (detaching) detach(t1);
			if (detaching) detach(div1);
		}
	};
}

const createId$1 = createCounter();

function instance$1$1($$self, $$props, $$invalidate) {
	let isActive;
	const omit_props_names = ["path","component","meta","primary"];
	let $$restProps = compute_rest_props($$props, omit_props_names);
	let $parentBase;
	let $location;
	let $activeRoute;
	let $params;
	let { $$slots: slots = {}, $$scope } = $$props;
	let { path = "" } = $$props;
	let { component = null } = $$props;
	let { meta = {} } = $$props;
	let { primary = true } = $$props;
	usePreflightCheck(ROUTE_ID, $$props);
	const id = createId$1();
	const { registerRoute, unregisterRoute, activeRoute } = getContext(ROUTER);
	component_subscribe($$self, activeRoute, value => $$invalidate(16, $activeRoute = value));
	const parentBase = useRouteBase();
	component_subscribe($$self, parentBase, value => $$invalidate(15, $parentBase = value));
	const location = useLocation();
	component_subscribe($$self, location, value => $$invalidate(2, $location = value));
	const focusElement = writable(null);

	// In SSR we cannot wait for $activeRoute to update,
	// so we use the match returned from `registerRoute` instead
	let ssrMatch;

	const route = writable();
	const params = writable({});
	component_subscribe($$self, params, value => $$invalidate(4, $params = value));
	setContext(ROUTE, route);
	setContext(ROUTE_PARAMS, params);
	setContext(FOCUS_ELEM, focusElement);

	// We need to call useNavigate after the route is set,
	// so we can use the routes path for link resolution
	const navigate = useNavigate();

	// There is no need to unregister Routes in SSR since it will all be
	// thrown away anyway
	if (!isSSR) {
		onDestroy(() => unregisterRoute(id));
	}

	$$self.$$set = $$new_props => {
		$$invalidate(23, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		$$invalidate(11, $$restProps = compute_rest_props($$props, omit_props_names));
		if ("path" in $$new_props) $$invalidate(12, path = $$new_props.path);
		if ("component" in $$new_props) $$invalidate(0, component = $$new_props.component);
		if ("meta" in $$new_props) $$invalidate(13, meta = $$new_props.meta);
		if ("primary" in $$new_props) $$invalidate(1, primary = $$new_props.primary);
		if ("$$scope" in $$new_props) $$invalidate(18, $$scope = $$new_props.$$scope);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*path, $parentBase, meta, $location, primary*/ 45062) {
			 {
				// The route store will be re-computed whenever props, location or parentBase change
				const isDefault = path === "";

				const rawBase = join($parentBase, path);

				const updatedRoute = {
					id,
					path,
					meta,
					// If no path prop is given, this Route will act as the default Route
					// that is rendered if no other Route in the Router is a match
					default: isDefault,
					fullPath: isDefault ? "" : rawBase,
					base: isDefault
					? $parentBase
					: extractBaseUri(rawBase, $location.pathname),
					primary,
					focusElement
				};

				route.set(updatedRoute);

				// If we're in SSR mode and the Route matches,
				// `registerRoute` will return the match
				$$invalidate(14, ssrMatch = registerRoute(updatedRoute));
			}
		}

		if ($$self.$$.dirty & /*ssrMatch, $activeRoute*/ 81920) {
			 $$invalidate(3, isActive = !!(ssrMatch || $activeRoute && $activeRoute.id === id));
		}

		if ($$self.$$.dirty & /*isActive, ssrMatch, $activeRoute*/ 81928) {
			 if (isActive) {
				const { params: activeParams } = ssrMatch || $activeRoute;
				params.set(activeParams);
			}
		}
	};

	$$props = exclude_internal_props($$props);

	return [
		component,
		primary,
		$location,
		isActive,
		$params,
		id,
		activeRoute,
		parentBase,
		location,
		params,
		navigate,
		$$restProps,
		path,
		meta,
		ssrMatch,
		$parentBase,
		$activeRoute,
		slots,
		$$scope
	];
}

class Route extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance$1$1, create_fragment$1$1, safe_not_equal, {
			path: 12,
			component: 0,
			meta: 13,
			primary: 1
		});
	}
}

/* src\Link.svelte generated by Svelte v3.31.2 */

function create_fragment$2$1(ctx) {
	let a;
	let current;
	let mounted;
	let dispose;
	const default_slot_template = /*#slots*/ ctx[13].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[12], null);
	let a_levels = [{ href: /*href*/ ctx[0] }, /*ariaCurrent*/ ctx[1], /*props*/ ctx[2]];
	let a_data = {};

	for (let i = 0; i < a_levels.length; i += 1) {
		a_data = assign(a_data, a_levels[i]);
	}

	return {
		c() {
			a = element("a");
			if (default_slot) default_slot.c();
			set_attributes(a, a_data);
		},
		m(target, anchor) {
			insert(target, a, anchor);

			if (default_slot) {
				default_slot.m(a, null);
			}

			current = true;

			if (!mounted) {
				dispose = listen(a, "click", /*onClick*/ ctx[4]);
				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (default_slot) {
				if (default_slot.p && dirty & /*$$scope*/ 4096) {
					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[12], dirty, null, null);
				}
			}

			set_attributes(a, a_data = get_spread_update(a_levels, [
				(!current || dirty & /*href*/ 1) && { href: /*href*/ ctx[0] },
				dirty & /*ariaCurrent*/ 2 && /*ariaCurrent*/ ctx[1],
				dirty & /*props*/ 4 && /*props*/ ctx[2]
			]));
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(a);
			if (default_slot) default_slot.d(detaching);
			mounted = false;
			dispose();
		}
	};
}

function instance$2$1($$self, $$props, $$invalidate) {
	let href;
	let isPartiallyCurrent;
	let isCurrent;
	let ariaCurrent;
	let props;
	const omit_props_names = ["to","replace","state","getProps"];
	let $$restProps = compute_rest_props($$props, omit_props_names);
	let $location;
	let { $$slots: slots = {}, $$scope } = $$props;
	let { to } = $$props;
	let { replace = false } = $$props;
	let { state = {} } = $$props;
	let { getProps = null } = $$props;
	usePreflightCheck(LINK_ID, $$props);
	const location = useLocation();
	component_subscribe($$self, location, value => $$invalidate(9, $location = value));
	const dispatch = createEventDispatcher();
	const resolve = useResolve();
	const { navigate } = useHistory();

	function onClick(event) {
		dispatch("click", event);

		if (shouldNavigate(event)) {
			event.preventDefault();

			// Don't push another entry to the history stack when the user
			// clicks on a Link to the page they are currently on.
			const shouldReplace = isCurrent || replace;

			navigate(href, { state, replace: shouldReplace });
		}
	}

	$$self.$$set = $$new_props => {
		$$invalidate(17, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		$$invalidate(18, $$restProps = compute_rest_props($$props, omit_props_names));
		if ("to" in $$new_props) $$invalidate(5, to = $$new_props.to);
		if ("replace" in $$new_props) $$invalidate(6, replace = $$new_props.replace);
		if ("state" in $$new_props) $$invalidate(7, state = $$new_props.state);
		if ("getProps" in $$new_props) $$invalidate(8, getProps = $$new_props.getProps);
		if ("$$scope" in $$new_props) $$invalidate(12, $$scope = $$new_props.$$scope);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*to, $location*/ 544) {
			// We need to pass location here to force re-resolution of the link,
			// when the pathname changes. Otherwise we could end up with stale path params,
			// when for example an :id changes in the parent Routes path
			 $$invalidate(0, href = resolve(to, $location));
		}

		if ($$self.$$.dirty & /*$location, href*/ 513) {
			 $$invalidate(10, isPartiallyCurrent = startsWith($location.pathname, href));
		}

		if ($$self.$$.dirty & /*href, $location*/ 513) {
			 $$invalidate(11, isCurrent = href === $location.pathname);
		}

		if ($$self.$$.dirty & /*isCurrent*/ 2048) {
			 $$invalidate(1, ariaCurrent = isCurrent ? { "aria-current": "page" } : {});
		}

		 $$invalidate(2, props = (() => {
			if (isFunction(getProps)) {
				const dynamicProps = getProps({
					location: $location,
					href,
					isPartiallyCurrent,
					isCurrent
				});

				return { ...$$restProps, ...dynamicProps };
			}

			return $$restProps;
		})());
	};

	$$props = exclude_internal_props($$props);

	return [
		href,
		ariaCurrent,
		props,
		location,
		onClick,
		to,
		replace,
		state,
		getProps,
		$location,
		isPartiallyCurrent,
		isCurrent,
		$$scope,
		slots
	];
}

class Link extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$2$1, create_fragment$2$1, safe_not_equal, { to: 5, replace: 6, state: 7, getProps: 8 });
	}
}

function isTypeOf(value, ...keys) {
    for (const key of keys)
        if (!(key in value))
            return false;
    return true;
}
function assert(condition, errMsg = 'Assert failed') {
    if (!condition) {
        console.trace(errMsg);
        throw new Error(errMsg);
    }
}
function assertTypeOf(value, ...keys) {
    return assert(isTypeOf(value, ...keys));
}

const BASE_URL$1 = 'https://8778eno8ha.execute-api.eu-central-1.amazonaws.com';
const LINEBREAK = '\n';
const WORDBREAK = '\u0001';
function listToObject(list) {
    let ret = {};
    assert(list.length % 2 === 0, 'List length must be even');
    for (let i = 0; i < list.length; i += 2) {
        const key = list[i];
        const value = list[i + 1];
        ret[key] = value;
    }
    return ret;
}
async function get$1(path, params = {}) {
    const url = new URL(path, BASE_URL$1);
    const searchParams = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, `${v}`]));
    url.search = searchParams.toString();
    const resp = await fetch(url.toString());
    const data = await resp.text();
    // split response into lines, and then lines into words
    return data.split(LINEBREAK).map(line => line.split(WORDBREAK));
}
async function listLevels(category, page) {
    const data = await get$1('/prod/list_levels2', { category, page });
    const [[assetPath], [numPages], ...levelData] = data;
    const levels = levelData.map(level => {
        const levelInfo = listToObject(level);
        assertTypeOf(levelInfo, 'name', 'author', 'difficulty', 'desc', 'id');
        return levelInfo;
    });
    return {
        assetPath,
        numPages: parseInt(numPages),
        levels
    };
}
async function getLevel(level) {
    const data = await get$1('/prod/get_level', { level });
    const [[assetPath], [...levelData]] = data;
    const levelInfo = listToObject(levelData);
    assertTypeOf(levelInfo, 'name', 'author', 'difficulty');
    return Object.assign({ assetPath }, levelInfo);
}

var _babaApi = /*#__PURE__*/Object.freeze({
    __proto__: null,
    listLevels: listLevels,
    getLevel: getLevel
});

// DEFLATE is a complex format; to read this code, you should probably check the RFC first:

// aliases for shorter compressed code (most minifers don't do this)
var u8 = Uint8Array, u16 = Uint16Array, u32 = Uint32Array;
// fixed length extra bits
var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0]);
// fixed distance extra bits
// see fleb note
var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0]);
// code length index map
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
// get base, reverse index map from extra bits
var freb = function (eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
        b[i] = start += 1 << eb[i - 1];
    }
    // numbers here are at max 18 bits
    var r = new u32(b[30]);
    for (var i = 1; i < 30; ++i) {
        for (var j = b[i]; j < b[i + 1]; ++j) {
            r[j] = ((j - b[i]) << 5) | i;
        }
    }
    return [b, r];
};
var _a = freb(fleb, 2), fl = _a[0], revfl = _a[1];
// we can ignore the fact that the other numbers are wrong; they never happen anyway
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), fd = _b[0];
// map of value to reverse (assuming 16 bits)
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
    // reverse table algorithm from SO
    var x = ((i & 0xAAAA) >>> 1) | ((i & 0x5555) << 1);
    x = ((x & 0xCCCC) >>> 2) | ((x & 0x3333) << 2);
    x = ((x & 0xF0F0) >>> 4) | ((x & 0x0F0F) << 4);
    rev[i] = (((x & 0xFF00) >>> 8) | ((x & 0x00FF) << 8)) >>> 1;
}
// create huffman tree from u8 "map": index -> code length for code index
// mb (max bits) must be at most 15
// TODO: optimize/split up?
var hMap = (function (cd, mb, r) {
    var s = cd.length;
    // index
    var i = 0;
    // u16 "map": index -> # of codes with bit length = index
    var l = new u16(mb);
    // length of cd must be 288 (total # of codes)
    for (; i < s; ++i)
        ++l[cd[i] - 1];
    // u16 "map": index -> minimum code for bit length = index
    var le = new u16(mb);
    for (i = 0; i < mb; ++i) {
        le[i] = (le[i - 1] + l[i - 1]) << 1;
    }
    var co;
    if (r) {
        // u16 "map": index -> number of actual bits, symbol for code
        co = new u16(1 << mb);
        // bits to remove for reverser
        var rvb = 15 - mb;
        for (i = 0; i < s; ++i) {
            // ignore 0 lengths
            if (cd[i]) {
                // num encoding both symbol and bits read
                var sv = (i << 4) | cd[i];
                // free bits
                var r_1 = mb - cd[i];
                // start value
                var v = le[cd[i] - 1]++ << r_1;
                // m is end value
                for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
                    // every 16 bit value starting with the code yields the same result
                    co[rev[v] >>> rvb] = sv;
                }
            }
        }
    }
    else {
        co = new u16(s);
        for (i = 0; i < s; ++i) {
            if (cd[i]) {
                co[i] = rev[le[cd[i] - 1]++] >>> (15 - cd[i]);
            }
        }
    }
    return co;
});
// fixed length tree
var flt = new u8(288);
for (var i = 0; i < 144; ++i)
    flt[i] = 8;
for (var i = 144; i < 256; ++i)
    flt[i] = 9;
for (var i = 256; i < 280; ++i)
    flt[i] = 7;
for (var i = 280; i < 288; ++i)
    flt[i] = 8;
// fixed distance tree
var fdt = new u8(32);
for (var i = 0; i < 32; ++i)
    fdt[i] = 5;
// fixed length map
var flrm = /*#__PURE__*/ hMap(flt, 9, 1);
// fixed distance map
var fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
// find max of array
var max = function (a) {
    var m = a[0];
    for (var i = 1; i < a.length; ++i) {
        if (a[i] > m)
            m = a[i];
    }
    return m;
};
// read d, starting at bit p and mask with m
var bits = function (d, p, m) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8)) >> (p & 7)) & m;
};
// read d, starting at bit p continuing for at least 16 bits
var bits16 = function (d, p) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >> (p & 7));
};
// get end of byte
var shft = function (p) { return ((p + 7) / 8) | 0; };
// typed array slice - allows garbage collector to free original reference,
// while being more compatible than .slice
var slc = function (v, s, e) {
    if (s == null || s < 0)
        s = 0;
    if (e == null || e > v.length)
        e = v.length;
    // can't use .constructor in case user-supplied
    var n = new (v instanceof u16 ? u16 : v instanceof u32 ? u32 : u8)(e - s);
    n.set(v.subarray(s, e));
    return n;
};
// error codes
var ec = [
    'unexpected EOF',
    'invalid block type',
    'invalid length/literal',
    'invalid distance',
    'stream finished',
    'no stream handler',
    ,
    'no callback',
    'invalid UTF-8 data',
    'extra field too long',
    'date not in range 1980-2099',
    'filename too long',
    'stream finishing',
    'invalid zip data'
    // determined by unknown compression method
];
var err = function (ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
        Error.captureStackTrace(e, err);
    if (!nt)
        throw e;
    return e;
};
// expands raw DEFLATE data
var inflt = function (dat, buf, st) {
    // source length
    var sl = dat.length;
    if (!sl || (st && st.f && !st.l))
        return buf || new u8(0);
    // have to estimate size
    var noBuf = !buf || st;
    // no state
    var noSt = !st || st.i;
    if (!st)
        st = {};
    // Assumes roughly 33% compression ratio average
    if (!buf)
        buf = new u8(sl * 3);
    // ensure buffer can fit at least l elements
    var cbuf = function (l) {
        var bl = buf.length;
        // need to increase size to fit
        if (l > bl) {
            // Double or set to necessary, whichever is greater
            var nbuf = new u8(Math.max(bl * 2, l));
            nbuf.set(buf);
            buf = nbuf;
        }
    };
    //  last chunk         bitpos           bytes
    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
    // total bits
    var tbts = sl * 8;
    do {
        if (!lm) {
            // BFINAL - this is only 1 when last chunk is next
            final = bits(dat, pos, 1);
            // type: 0 = no compression, 1 = fixed huffman, 2 = dynamic huffman
            var type = bits(dat, pos + 1, 3);
            pos += 3;
            if (!type) {
                // go to end of byte boundary
                var s = shft(pos) + 4, l = dat[s - 4] | (dat[s - 3] << 8), t = s + l;
                if (t > sl) {
                    if (noSt)
                        err(0);
                    break;
                }
                // ensure size
                if (noBuf)
                    cbuf(bt + l);
                // Copy over uncompressed data
                buf.set(dat.subarray(s, t), bt);
                // Get new bitpos, update byte count
                st.b = bt += l, st.p = pos = t * 8, st.f = final;
                continue;
            }
            else if (type == 1)
                lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
            else if (type == 2) {
                //  literal                            lengths
                var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
                var tl = hLit + bits(dat, pos + 5, 31) + 1;
                pos += 14;
                // length+distance tree
                var ldt = new u8(tl);
                // code length tree
                var clt = new u8(19);
                for (var i = 0; i < hcLen; ++i) {
                    // use index map to get real code
                    clt[clim[i]] = bits(dat, pos + i * 3, 7);
                }
                pos += hcLen * 3;
                // code lengths bits
                var clb = max(clt), clbmsk = (1 << clb) - 1;
                // code lengths map
                var clm = hMap(clt, clb, 1);
                for (var i = 0; i < tl;) {
                    var r = clm[bits(dat, pos, clbmsk)];
                    // bits read
                    pos += r & 15;
                    // symbol
                    var s = r >>> 4;
                    // code length to copy
                    if (s < 16) {
                        ldt[i++] = s;
                    }
                    else {
                        //  copy   count
                        var c = 0, n = 0;
                        if (s == 16)
                            n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
                        else if (s == 17)
                            n = 3 + bits(dat, pos, 7), pos += 3;
                        else if (s == 18)
                            n = 11 + bits(dat, pos, 127), pos += 7;
                        while (n--)
                            ldt[i++] = c;
                    }
                }
                //    length tree                 distance tree
                var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
                // max length bits
                lbt = max(lt);
                // max dist bits
                dbt = max(dt);
                lm = hMap(lt, lbt, 1);
                dm = hMap(dt, dbt, 1);
            }
            else
                err(1);
            if (pos > tbts) {
                if (noSt)
                    err(0);
                break;
            }
        }
        // Make sure the buffer can hold this + the largest possible addition
        // Maximum chunk size (practically, theoretically infinite) is 2^17;
        if (noBuf)
            cbuf(bt + 131072);
        var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
        var lpos = pos;
        for (;; lpos = pos) {
            // bits read, code
            var c = lm[bits16(dat, pos) & lms], sym = c >>> 4;
            pos += c & 15;
            if (pos > tbts) {
                if (noSt)
                    err(0);
                break;
            }
            if (!c)
                err(2);
            if (sym < 256)
                buf[bt++] = sym;
            else if (sym == 256) {
                lpos = pos, lm = null;
                break;
            }
            else {
                var add = sym - 254;
                // no extra bits needed if less
                if (sym > 264) {
                    // index
                    var i = sym - 257, b = fleb[i];
                    add = bits(dat, pos, (1 << b) - 1) + fl[i];
                    pos += b;
                }
                // dist
                var d = dm[bits16(dat, pos) & dms], dsym = d >>> 4;
                if (!d)
                    err(3);
                pos += d & 15;
                var dt = fd[dsym];
                if (dsym > 3) {
                    var b = fdeb[dsym];
                    dt += bits16(dat, pos) & ((1 << b) - 1), pos += b;
                }
                if (pos > tbts) {
                    if (noSt)
                        err(0);
                    break;
                }
                if (noBuf)
                    cbuf(bt + 131072);
                var end = bt + add;
                for (; bt < end; bt += 4) {
                    buf[bt] = buf[bt - dt];
                    buf[bt + 1] = buf[bt + 1 - dt];
                    buf[bt + 2] = buf[bt + 2 - dt];
                    buf[bt + 3] = buf[bt + 3 - dt];
                }
                bt = end;
            }
        }
        st.l = lm, st.p = lpos, st.b = bt, st.f = final;
        if (lm)
            final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    return bt == buf.length ? buf : slc(buf, 0, bt);
};
// empty
var et = /*#__PURE__*/ new u8(0);
// zlib valid
var zlv = function (d) {
    if ((d[0] & 15) != 8 || (d[0] >>> 4) > 7 || ((d[0] << 8 | d[1]) % 31))
        err(6, 'invalid zlib data');
    if (d[1] & 32)
        err(6, 'invalid zlib data: preset dictionaries not supported');
};
/**
 * Expands Zlib data
 * @param data The data to decompress
 * @param out Where to write the data. Saves memory if you know the decompressed size and provide an output buffer of that length.
 * @returns The decompressed version of the data
 */
function unzlibSync(data, out) {
    return inflt((zlv(data), data.subarray(2, -4)), out);
}
// text decoder
var td = typeof TextDecoder != 'undefined' && /*#__PURE__*/ new TextDecoder();
// text decoder stream
var tds = 0;
try {
    td.decode(et, { stream: true });
    tds = 1;
}
catch (e) { }

const BASE_URL = 'https://babalevels3.s3.eu-central-1.amazonaws.com';
function decompress(buffer) {
    const decompressed = unzlibSync(new Uint8Array(buffer));
    return decompressed.buffer;
}
async function get(path) {
    const url = new URL(path, BASE_URL);
    const resp = await fetch(url.toString());
    return await resp.arrayBuffer();
}
function getThumbUrl(id) {
    return `${BASE_URL}/${id}.png`;
}
async function getThumbImage(id) {
    return await get(`${id}.png`);
}
async function getLevelMap(id) {
    const buffer = await get(`${id}.l`);
    return decompress(buffer);
}
async function getLevelData(id) {
    const buffer = await get(`${id}.ld`);
    return decompress(buffer);
}

var _babaAssets = /*#__PURE__*/Object.freeze({
    __proto__: null,
    getThumbUrl: getThumbUrl,
    getThumbImage: getThumbImage,
    getLevelMap: getLevelMap,
    getLevelData: getLevelData
});

const babaApi = _babaApi;
const babaAssets = _babaAssets;

/* src/routes/Index.svelte generated by Svelte v3.39.0 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[7] = list[i];
	return child_ctx;
}

// (57:4) {:catch error}
function create_catch_block$1(ctx) {
	let p;
	let t0;
	let t1_value = /*error*/ ctx[10].message + "";
	let t1;

	return {
		c() {
			p = element("p");
			t0 = text("Error fetching level list: ");
			t1 = text(t1_value);
		},
		m(target, anchor) {
			insert(target, p, anchor);
			append(p, t0);
			append(p, t1);
		},
		p(ctx, dirty) {
			if (dirty & /*currentPage*/ 1 && t1_value !== (t1_value = /*error*/ ctx[10].message + "")) set_data(t1, t1_value);
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(p);
		}
	};
}

// (44:4) {:then levels}
function create_then_block$1(ctx) {
	let each_1_anchor;
	let current;
	let each_value = /*levels*/ ctx[6];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	const out = i => transition_out(each_blocks[i], 1, 1, () => {
		each_blocks[i] = null;
	});

	return {
		c() {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			each_1_anchor = empty();
		},
		m(target, anchor) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(target, anchor);
			}

			insert(target, each_1_anchor, anchor);
			current = true;
		},
		p(ctx, dirty) {
			if (dirty & /*getLevelList, currentPage, getLevelThumb*/ 49) {
				each_value = /*levels*/ ctx[6];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
						transition_in(each_blocks[i], 1);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						transition_in(each_blocks[i], 1);
						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
					}
				}

				group_outros();

				for (i = each_value.length; i < each_blocks.length; i += 1) {
					out(i);
				}

				check_outros();
			}
		},
		i(local) {
			if (current) return;

			for (let i = 0; i < each_value.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			current = true;
		},
		o(local) {
			each_blocks = each_blocks.filter(Boolean);

			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			current = false;
		},
		d(detaching) {
			destroy_each(each_blocks, detaching);
			if (detaching) detach(each_1_anchor);
		}
	};
}

// (47:10) <Link to="level/{ level.id }">
function create_default_slot$1(ctx) {
	let img;
	let img_src_value;
	let t0;
	let h3;
	let t1_value = /*level*/ ctx[7].name + "";
	let t1;
	let t2;
	let div0;
	let t3;
	let t4_value = /*level*/ ctx[7].author + "";
	let t4;
	let t5;
	let div1;
	let t6_value = /*level*/ ctx[7].difficulty + "";
	let t6;
	let t7;
	let p;
	let t8_value = /*level*/ ctx[7].desc + "";
	let t8;

	return {
		c() {
			img = element("img");
			t0 = space();
			h3 = element("h3");
			t1 = text(t1_value);
			t2 = space();
			div0 = element("div");
			t3 = text("By ");
			t4 = text(t4_value);
			t5 = space();
			div1 = element("div");
			t6 = text(t6_value);
			t7 = space();
			p = element("p");
			t8 = text(t8_value);
			attr(img, "class", "LevelCard__thumb LevelThumb");
			if (img.src !== (img_src_value = /*getLevelThumb*/ ctx[4](/*level*/ ctx[7].id))) attr(img, "src", img_src_value);
			attr(img, "alt", "");
			attr(h3, "class", "LevelCard__title");
			attr(div0, "class", "LevelCard__author");
			attr(div1, "class", "LevelCard__difficulty");
			attr(p, "class", "LevelCard__description");
		},
		m(target, anchor) {
			insert(target, img, anchor);
			insert(target, t0, anchor);
			insert(target, h3, anchor);
			append(h3, t1);
			insert(target, t2, anchor);
			insert(target, div0, anchor);
			append(div0, t3);
			append(div0, t4);
			insert(target, t5, anchor);
			insert(target, div1, anchor);
			append(div1, t6);
			insert(target, t7, anchor);
			insert(target, p, anchor);
			append(p, t8);
		},
		p(ctx, dirty) {
			if (dirty & /*currentPage*/ 1 && img.src !== (img_src_value = /*getLevelThumb*/ ctx[4](/*level*/ ctx[7].id))) {
				attr(img, "src", img_src_value);
			}

			if (dirty & /*currentPage*/ 1 && t1_value !== (t1_value = /*level*/ ctx[7].name + "")) set_data(t1, t1_value);
			if (dirty & /*currentPage*/ 1 && t4_value !== (t4_value = /*level*/ ctx[7].author + "")) set_data(t4, t4_value);
			if (dirty & /*currentPage*/ 1 && t6_value !== (t6_value = /*level*/ ctx[7].difficulty + "")) set_data(t6, t6_value);
			if (dirty & /*currentPage*/ 1 && t8_value !== (t8_value = /*level*/ ctx[7].desc + "")) set_data(t8, t8_value);
		},
		d(detaching) {
			if (detaching) detach(img);
			if (detaching) detach(t0);
			if (detaching) detach(h3);
			if (detaching) detach(t2);
			if (detaching) detach(div0);
			if (detaching) detach(t5);
			if (detaching) detach(div1);
			if (detaching) detach(t7);
			if (detaching) detach(p);
		}
	};
}

// (45:6) {#each levels as level}
function create_each_block(ctx) {
	let div;
	let link;
	let t;
	let current;

	link = new Link({
			props: {
				to: "level/" + /*level*/ ctx[7].id,
				$$slots: { default: [create_default_slot$1] },
				$$scope: { ctx }
			}
		});

	return {
		c() {
			div = element("div");
			create_component(link.$$.fragment);
			t = space();
			attr(div, "class", "LevelCard");
		},
		m(target, anchor) {
			insert(target, div, anchor);
			mount_component(link, div, null);
			append(div, t);
			current = true;
		},
		p(ctx, dirty) {
			const link_changes = {};
			if (dirty & /*currentPage*/ 1) link_changes.to = "level/" + /*level*/ ctx[7].id;

			if (dirty & /*$$scope, currentPage*/ 2049) {
				link_changes.$$scope = { dirty, ctx };
			}

			link.$set(link_changes);
		},
		i(local) {
			if (current) return;
			transition_in(link.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(link.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div);
			destroy_component(link);
		}
	};
}

// (42:38)        <p>Loading...</p>     {:then levels}
function create_pending_block$1(ctx) {
	let p;

	return {
		c() {
			p = element("p");
			p.textContent = "Loading...";
		},
		m(target, anchor) {
			insert(target, p, anchor);
		},
		p: noop,
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(p);
		}
	};
}

function create_fragment$2(ctx) {
	let div3;
	let div1;
	let h2;
	let t1;
	let div0;
	let span0;
	let t3;
	let span1;
	let t4_value = /*currentPage*/ ctx[0] + 1 + "";
	let t4;
	let t5;
	let t6;
	let t7;
	let span2;
	let t9;
	let div2;
	let promise;
	let current;
	let mounted;
	let dispose;

	let info = {
		ctx,
		current: null,
		token: null,
		hasCatch: true,
		pending: create_pending_block$1,
		then: create_then_block$1,
		catch: create_catch_block$1,
		value: 6,
		error: 10,
		blocks: [,,,]
	};

	handle_promise(promise = /*getLevelList*/ ctx[5](/*currentPage*/ ctx[0]), info);

	return {
		c() {
			div3 = element("div");
			div1 = element("div");
			h2 = element("h2");
			h2.textContent = "Featured Levels";
			t1 = space();
			div0 = element("div");
			span0 = element("span");
			span0.textContent = "<";
			t3 = space();
			span1 = element("span");
			t4 = text(t4_value);
			t5 = text(" / ");
			t6 = text(/*totalPages*/ ctx[1]);
			t7 = space();
			span2 = element("span");
			span2.textContent = ">";
			t9 = space();
			div2 = element("div");
			info.block.c();
			attr(h2, "class", "LevelList__title");
			attr(span0, "class", "LevelList__button");
			attr(span1, "class", "LevelList__currPage");
			attr(span2, "class", "LevelList__button");
			attr(div0, "class", "LevelList__nav");
			attr(div1, "class", "LevelList__head");
			attr(div2, "class", "LevelList__body");
			attr(div3, "class", "LevelList");
		},
		m(target, anchor) {
			insert(target, div3, anchor);
			append(div3, div1);
			append(div1, h2);
			append(div1, t1);
			append(div1, div0);
			append(div0, span0);
			append(div0, t3);
			append(div0, span1);
			append(span1, t4);
			append(span1, t5);
			append(span1, t6);
			append(div0, t7);
			append(div0, span2);
			append(div3, t9);
			append(div3, div2);
			info.block.m(div2, info.anchor = null);
			info.mount = () => div2;
			info.anchor = null;
			current = true;

			if (!mounted) {
				dispose = [
					listen(span0, "click", /*prevPage*/ ctx[3]),
					listen(span2, "click", /*nextPage*/ ctx[2])
				];

				mounted = true;
			}
		},
		p(new_ctx, [dirty]) {
			ctx = new_ctx;
			if ((!current || dirty & /*currentPage*/ 1) && t4_value !== (t4_value = /*currentPage*/ ctx[0] + 1 + "")) set_data(t4, t4_value);
			if (!current || dirty & /*totalPages*/ 2) set_data(t6, /*totalPages*/ ctx[1]);
			info.ctx = ctx;

			if (dirty & /*currentPage*/ 1 && promise !== (promise = /*getLevelList*/ ctx[5](/*currentPage*/ ctx[0])) && handle_promise(promise, info)) ; else {
				update_await_block_branch(info, ctx, dirty);
			}
		},
		i(local) {
			if (current) return;
			transition_in(info.block);
			current = true;
		},
		o(local) {
			for (let i = 0; i < 3; i += 1) {
				const block = info.blocks[i];
				transition_out(block);
			}

			current = false;
		},
		d(detaching) {
			if (detaching) detach(div3);
			info.block.d();
			info.token = null;
			info = null;
			mounted = false;
			run_all(dispose);
		}
	};
}

function instance$1($$self, $$props, $$invalidate) {
	let { currentPage = 0 } = $$props;
	let { totalPages = 0 } = $$props;

	function nextPage() {
		if (currentPage < totalPages - 1) $$invalidate(0, currentPage += 1);
	}

	function prevPage() {
		if (currentPage > 0) $$invalidate(0, currentPage -= 1);
	}

	function getLevelThumb(id) {
		return babaAssets.getThumbUrl(id);
	}

	async function getLevelList(pageIndex) {
		const { numPages, levels } = await babaApi.listLevels('featured', pageIndex);
		$$invalidate(1, totalPages = numPages);
		return levels;
	}

	

	$$self.$$set = $$props => {
		if ('currentPage' in $$props) $$invalidate(0, currentPage = $$props.currentPage);
		if ('totalPages' in $$props) $$invalidate(1, totalPages = $$props.totalPages);
	};

	return [currentPage, totalPages, nextPage, prevPage, getLevelThumb, getLevelList];
}

class Index extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance$1, create_fragment$2, safe_not_equal, {
			currentPage: 0,
			totalPages: 1,
			nextPage: 2,
			prevPage: 3,
			getLevelThumb: 4,
			getLevelList: 5
		});
	}

	get nextPage() {
		return this.$$.ctx[2];
	}

	get prevPage() {
		return this.$$.ctx[3];
	}

	get getLevelThumb() {
		return this.$$.ctx[4];
	}

	get getLevelList() {
		return this.$$.ctx[5];
	}
}

/* src/routes/Level.svelte generated by Svelte v3.39.0 */

function create_catch_block(ctx) {
	let p;
	let t0;
	let t1_value = /*error*/ ctx[4].message + "";
	let t1;

	return {
		c() {
			p = element("p");
			t0 = text("Error fetching level: ");
			t1 = text(t1_value);
		},
		m(target, anchor) {
			insert(target, p, anchor);
			append(p, t0);
			append(p, t1);
		},
		p(ctx, dirty) {
			if (dirty & /*code*/ 1 && t1_value !== (t1_value = /*error*/ ctx[4].message + "")) set_data(t1, t1_value);
		},
		d(detaching) {
			if (detaching) detach(p);
		}
	};
}

// (16:2) {:then level}
function create_then_block(ctx) {
	let img;
	let img_src_value;
	let t0;
	let div0;
	let t1_value = /*level*/ ctx[3].name + "";
	let t1;
	let t2;
	let div1;
	let t3_value = /*level*/ ctx[3].author + "";
	let t3;
	let t4;
	let div2;
	let t5_value = /*level*/ ctx[3].difficulty + "";
	let t5;

	return {
		c() {
			img = element("img");
			t0 = space();
			div0 = element("div");
			t1 = text(t1_value);
			t2 = space();
			div1 = element("div");
			t3 = text(t3_value);
			t4 = space();
			div2 = element("div");
			t5 = text(t5_value);
			attr(img, "class", "LevelThumb");
			if (img.src !== (img_src_value = /*getLevelThumb*/ ctx[1](/*code*/ ctx[0]))) attr(img, "src", img_src_value);
			attr(img, "alt", "");
		},
		m(target, anchor) {
			insert(target, img, anchor);
			insert(target, t0, anchor);
			insert(target, div0, anchor);
			append(div0, t1);
			insert(target, t2, anchor);
			insert(target, div1, anchor);
			append(div1, t3);
			insert(target, t4, anchor);
			insert(target, div2, anchor);
			append(div2, t5);
		},
		p(ctx, dirty) {
			if (dirty & /*code*/ 1 && img.src !== (img_src_value = /*getLevelThumb*/ ctx[1](/*code*/ ctx[0]))) {
				attr(img, "src", img_src_value);
			}

			if (dirty & /*code*/ 1 && t1_value !== (t1_value = /*level*/ ctx[3].name + "")) set_data(t1, t1_value);
			if (dirty & /*code*/ 1 && t3_value !== (t3_value = /*level*/ ctx[3].author + "")) set_data(t3, t3_value);
			if (dirty & /*code*/ 1 && t5_value !== (t5_value = /*level*/ ctx[3].difficulty + "")) set_data(t5, t5_value);
		},
		d(detaching) {
			if (detaching) detach(img);
			if (detaching) detach(t0);
			if (detaching) detach(div0);
			if (detaching) detach(t2);
			if (detaching) detach(div1);
			if (detaching) detach(t4);
			if (detaching) detach(div2);
		}
	};
}

// (13:29)      <!-- promise is pending -->     <p>Loading...</p>   {:then level}
function create_pending_block(ctx) {
	let p;

	return {
		c() {
			p = element("p");
			p.textContent = "Loading...";
		},
		m(target, anchor) {
			insert(target, p, anchor);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(p);
		}
	};
}

function create_fragment$1(ctx) {
	let div;
	let promise;

	let info = {
		ctx,
		current: null,
		token: null,
		hasCatch: true,
		pending: create_pending_block,
		then: create_then_block,
		catch: create_catch_block,
		value: 3,
		error: 4
	};

	handle_promise(promise = /*getLevelInfo*/ ctx[2](/*code*/ ctx[0]), info);

	return {
		c() {
			div = element("div");
			info.block.c();
		},
		m(target, anchor) {
			insert(target, div, anchor);
			info.block.m(div, info.anchor = null);
			info.mount = () => div;
			info.anchor = null;
		},
		p(new_ctx, [dirty]) {
			ctx = new_ctx;
			info.ctx = ctx;

			if (dirty & /*code*/ 1 && promise !== (promise = /*getLevelInfo*/ ctx[2](/*code*/ ctx[0])) && handle_promise(promise, info)) ; else {
				update_await_block_branch(info, ctx, dirty);
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div);
			info.block.d();
			info.token = null;
			info = null;
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { code } = $$props;

	function getLevelThumb(id) {
		return babaAssets.getThumbUrl(id);
	}

	async function getLevelInfo(levelId) {
		return await babaApi.getLevel(levelId);
	}

	

	$$self.$$set = $$props => {
		if ('code' in $$props) $$invalidate(0, code = $$props.code);
	};

	return [code, getLevelThumb, getLevelInfo];
}

class Level extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance, create_fragment$1, safe_not_equal, {
			code: 0,
			getLevelThumb: 1,
			getLevelInfo: 2
		});
	}

	get getLevelThumb() {
		return this.$$.ctx[1];
	}

	get getLevelInfo() {
		return this.$$.ctx[2];
	}
}

/* src/App.svelte generated by Svelte v3.39.0 */

function create_default_slot_4(ctx) {
	let t;

	return {
		c() {
			t = text("Baba Levels");
		},
		m(target, anchor) {
			insert(target, t, anchor);
		},
		d(detaching) {
			if (detaching) detach(t);
		}
	};
}

// (16:6) <Link to="/">
function create_default_slot_3(ctx) {
	let t;

	return {
		c() {
			t = text("Featured Levels");
		},
		m(target, anchor) {
			insert(target, t, anchor);
		},
		d(detaching) {
			if (detaching) detach(t);
		}
	};
}

// (21:4) <Route path="/">
function create_default_slot_2(ctx) {
	let index;
	let current;
	index = new Index({});

	return {
		c() {
			create_component(index.$$.fragment);
		},
		m(target, anchor) {
			mount_component(index, target, anchor);
			current = true;
		},
		i(local) {
			if (current) return;
			transition_in(index.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(index.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(index, detaching);
		}
	};
}

// (24:4) <Route path="level/:code" let:params>
function create_default_slot_1(ctx) {
	let level;
	let current;
	level = new Level({ props: { code: /*params*/ ctx[0].code } });

	return {
		c() {
			create_component(level.$$.fragment);
		},
		m(target, anchor) {
			mount_component(level, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const level_changes = {};
			if (dirty & /*params*/ 1) level_changes.code = /*params*/ ctx[0].code;
			level.$set(level_changes);
		},
		i(local) {
			if (current) return;
			transition_in(level.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(level.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(level, detaching);
		}
	};
}

// (7:0) <Router>
function create_default_slot(ctx) {
	let nav;
	let div1;
	let div0;
	let h1;
	let link0;
	let t0;
	let span0;
	let t3;
	let div2;
	let link1;
	let t4;
	let div3;
	let route0;
	let t5;
	let route1;
	let t6;
	let footer;
	let current;

	link0 = new Link({
			props: {
				to: "/",
				$$slots: { default: [create_default_slot_4] },
				$$scope: { ctx }
			}
		});

	link1 = new Link({
			props: {
				to: "/",
				$$slots: { default: [create_default_slot_3] },
				$$scope: { ctx }
			}
		});

	route0 = new Route({
			props: {
				path: "/",
				$$slots: { default: [create_default_slot_2] },
				$$scope: { ctx }
			}
		});

	route1 = new Route({
			props: {
				path: "level/:code",
				$$slots: {
					default: [
						create_default_slot_1,
						({ params }) => ({ 0: params }),
						({ params }) => params ? 1 : 0
					]
				},
				$$scope: { ctx }
			}
		});

	return {
		c() {
			nav = element("nav");
			div1 = element("div");
			div0 = element("div");
			h1 = element("h1");
			create_component(link0.$$.fragment);
			t0 = space();
			span0 = element("span");
			span0.innerHTML = `Browse user-created levels from <a class="link" href="https://hempuli.com/baba/">Baba Is You</a>`;
			t3 = space();
			div2 = element("div");
			create_component(link1.$$.fragment);
			t4 = space();
			div3 = element("div");
			create_component(route0.$$.fragment);
			t5 = space();
			create_component(route1.$$.fragment);
			t6 = space();
			footer = element("footer");
			footer.innerHTML = `<span>Built by <a class="link" href="https://twitter.com/rakujira">James Daniel</a></span> | <a class="link" href="https://github.com/jaames/baba-levels">Source Code on GitHub</a>`;
			attr(h1, "class", "Intro__title");
			attr(span0, "class", "Intro__desc");
			attr(div0, "class", "Intro");
			attr(div1, "class", "NavGroup NavGroup--left");
			attr(div2, "class", "NavGroup NavGroup--right");
			attr(nav, "class", "Nav Wrapper");
			attr(div3, "class", "Content Wrapper");
			attr(footer, "class", "Footer Wrapper");
		},
		m(target, anchor) {
			insert(target, nav, anchor);
			append(nav, div1);
			append(div1, div0);
			append(div0, h1);
			mount_component(link0, h1, null);
			append(div0, t0);
			append(div0, span0);
			append(nav, t3);
			append(nav, div2);
			mount_component(link1, div2, null);
			insert(target, t4, anchor);
			insert(target, div3, anchor);
			mount_component(route0, div3, null);
			append(div3, t5);
			mount_component(route1, div3, null);
			insert(target, t6, anchor);
			insert(target, footer, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const link0_changes = {};

			if (dirty & /*$$scope*/ 2) {
				link0_changes.$$scope = { dirty, ctx };
			}

			link0.$set(link0_changes);
			const link1_changes = {};

			if (dirty & /*$$scope*/ 2) {
				link1_changes.$$scope = { dirty, ctx };
			}

			link1.$set(link1_changes);
			const route0_changes = {};

			if (dirty & /*$$scope*/ 2) {
				route0_changes.$$scope = { dirty, ctx };
			}

			route0.$set(route0_changes);
			const route1_changes = {};

			if (dirty & /*$$scope, params*/ 3) {
				route1_changes.$$scope = { dirty, ctx };
			}

			route1.$set(route1_changes);
		},
		i(local) {
			if (current) return;
			transition_in(link0.$$.fragment, local);
			transition_in(link1.$$.fragment, local);
			transition_in(route0.$$.fragment, local);
			transition_in(route1.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(link0.$$.fragment, local);
			transition_out(link1.$$.fragment, local);
			transition_out(route0.$$.fragment, local);
			transition_out(route1.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(nav);
			destroy_component(link0);
			destroy_component(link1);
			if (detaching) detach(t4);
			if (detaching) detach(div3);
			destroy_component(route0);
			destroy_component(route1);
			if (detaching) detach(t6);
			if (detaching) detach(footer);
		}
	};
}

function create_fragment(ctx) {
	let router;
	let current;

	router = new Router({
			props: {
				$$slots: { default: [create_default_slot] },
				$$scope: { ctx }
			}
		});

	return {
		c() {
			create_component(router.$$.fragment);
		},
		m(target, anchor) {
			mount_component(router, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const router_changes = {};

			if (dirty & /*$$scope*/ 2) {
				router_changes.$$scope = { dirty, ctx };
			}

			router.$set(router_changes);
		},
		i(local) {
			if (current) return;
			transition_in(router.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(router.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(router, detaching);
		}
	};
}

class App extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, null, create_fragment, safe_not_equal, {});
	}
}

new App({
    target: document.body,
});
