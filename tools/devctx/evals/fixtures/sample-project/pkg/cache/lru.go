package cache

import "sync"

type LRUCache struct {
	mu       sync.Mutex
	capacity int
	items    map[string]*entry
	order    []string
}

type entry struct {
	key   string
	value interface{}
}

func NewLRUCache(capacity int) *LRUCache {
	return &LRUCache{
		capacity: capacity,
		items:    make(map[string]*entry),
	}
}

func (c *LRUCache) Get(key string) (interface{}, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	e, ok := c.items[key]
	if !ok {
		return nil, false
	}
	c.moveToFront(key)
	return e.value, true
}

func (c *LRUCache) Set(key string, value interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if _, ok := c.items[key]; ok {
		c.items[key].value = value
		c.moveToFront(key)
		return
	}

	if len(c.items) >= c.capacity {
		c.evict()
	}

	c.items[key] = &entry{key: key, value: value}
	c.order = append([]string{key}, c.order...)
}

func (c *LRUCache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	delete(c.items, key)
	for i, k := range c.order {
		if k == key {
			c.order = append(c.order[:i], c.order[i+1:]...)
			break
		}
	}
}

func (c *LRUCache) moveToFront(key string) {
	for i, k := range c.order {
		if k == key {
			c.order = append(c.order[:i], c.order[i+1:]...)
			break
		}
	}
	c.order = append([]string{key}, c.order...)
}

func (c *LRUCache) evict() {
	if len(c.order) == 0 {
		return
	}
	oldest := c.order[len(c.order)-1]
	delete(c.items, oldest)
	c.order = c.order[:len(c.order)-1]
}
