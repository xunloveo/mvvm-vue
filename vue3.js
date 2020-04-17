/*
  Vue3 实现响应式原理 主要使用了proxy
  vue2 缺点： 使用了递归  数组改变长度无效 对象不存在的属性不能被拦截
*/

let toProxy = new WeakMap() // 原对象： 代理过的对象
let toRaw = new WeakMap() // 代理过的对象： 原对象

// 判断是不是对象
function isObject(val) {
  return typeof val === 'object' && val !== null
}

// 判断是不是自己的属性
function hasOwn(target, key) {
  return target.hasOwnProperty(key)
}

// 响应式
function reactive(target) {
  return createReactiveObject(target)
}

// 创建响应式对象
function createReactiveObject(target) {
  if (!isObject(target)) {
    // 如果不是对象 直接返回
    return target
  }

  let proxy = toProxy.get(target)
  if (proxy) {
    // 如果已经代理过了 直接返回代理的结果
    return proxy
  }
  if (toRaw.has(target)) {
    // 防止代理过的对象 被再次代理
    return target
  }

  let baseHandler = {
    // reflect 优点 不会报错 而且会有返回值 有object的所有方法
    get(target, key, receiver) {
      let result = Reflect.get(target, key, receiver)
      // 搜集依赖 订阅 把当前的key 和effect 对应起来
      track(target, key) // 如果目标上的key 变化了 重新让数组中的effect执行即可
      // 如果有多层的时候 需要判断 进行递归操作
      return isObject(result) ? reactive(result) : result
    },
    set(target, key, value, receiver) {
      // 如何识别 是修改还是新增属性
      let hasKey = hasOwn(target, key)
      let oldValue = target[key]
      let res = Reflect.set(target, key, value, receiver)
      if (!hasKey) {
        trigger(target, 'add', key)
      } else if (oldValue !== value) {
        // 为了屏蔽 无意义的更改
        trigger(target, 'edit', key)
      }
      return res
    },
    deleteProperty(target, key) {
      let res = Reflect.delete(target, key)
      return res
    }
  }
  let observed = new Proxy(target, baseHandler)
  toProxy.set(target, observed)
  toRaw.set(observed, target)
  return observed
}

let activeEffectStacks = []
// 数据格式 如下
// {   ------------------------- WeakMap
//   target: {   ------------------ Map
//     key: [fn, fn, fn] ------------- Set
//   }
// }

let targetsMap = new WeakMap()
// 追踪 如果目标上的key 变化了 重新让数组中的effect执行即可
function track(target, key) {
  let effect = activeEffectStacks[activeEffectStacks.length - 1]
  if (effect) {
    // 如果存在对应关系
    let depsMap = targetsMap.get(target)
    if (!depsMap) {
      targetsMap.set(target, (depsMap = new Map()))
    }
    let deps = depsMap.get(key)
    if (!deps) {
      depsMap.set(key, (deps = new Set()))
    }
    if (!deps.has(effect)) {
      deps.add(effect)
    }
  }
}

// 设置的时候自动触发
function trigger(target, type, key) {
  let depsMap = targetsMap.get(target)
  if (depsMap) {
    let deps = depsMap.get(key)
    if (deps) {
      deps.forEach(effect => {
        effect()
      })
    }
  }
}

// 响应式 副作用
function effect(fn) {
  // 需要把这个函数变成响应式的函数
  let effect = createReactiveEffect(fn)
  effect() // 默认先执行一次
}

// 响应式函数
function createReactiveEffect(fn) {
  let effect = function() {
    return run(effect, fn) // 运行 目的是： 1. 让fn执行 2. 把effect存到栈中
  }
  return effect
}

function run(effect, fn) {
  // 运行fn 把effect存到栈中
  try {
    activeEffectStacks.push(effect)
    fn()
  } finally {
    activeEffectStacks.pop()
  }
}
// 依赖搜集 发布订阅
let obj = reactive({ name: 'xx', age: { n: 200 } })
effect(() => {
  console.log(obj.age.n)
})
obj.age.n = 300
// console.log(obj.name)

// let obj = { name: 'xx', num: [1, 2, 3], x: { xx: 'xxx' } }
// let proxy = reactive(obj)
// // proxy.name = 'xxx'
// // proxy.age = 18
// // proxy.x.xx = 'xxxxxx'
// proxy.num.push(4)
// console.log('o', proxy.num)

// 需要记录一下 如果这个对象被代理过了 就不需要 new了 用map来存
// 比如 以下 如果没记录 就会多次代理
// let obj= {name: 'zx'}
// let proxy = reactive(obj)
// reactive(obj)
// reactive(obj)
// reactive(proxy)
// reactive(proxy)

// let arr = [1, 2, 3]
// let proxy = reactive(arr)
// // proxy.push(4)
// proxy.length = 100
