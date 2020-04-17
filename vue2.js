/**
 * 创建一个Vue2构造函数 相当于 Vue
 * @param {*} options 初始值
 * new Vue({
 *    el: '',
 *    data {},
 *     ...
 * })
 */
function Vue2(options = {}) {
  this.$options = options // 把属性挂载到$options上
  let data = (this._data = this.$options.data) // 设置 this._data
  // 数据劫持
  observe(data)
  // 数据代理  this代理 this._data  比如获取vue中data的值 可以直接 this获取
  for (let key in data) {
    Object.defineProperty(this, key, {
      configurable: true,
      get() {
        return this._data[key]
      },
      set(newVal) {
        this._data[key] = newVal
      },
    })
  }
  // 初始化一个computed
  initComputed.call(this)
  // 编译
  new Compile(options.el, this)
  // 执行mounted钩子
  options.mounted.call(this)
}

/**
 * 创建一个Observe构造函数 写劫持逻辑
 * 数据劫持 使用Object.defineProperty
 * @param {*} data
 */
function Observe(data) {
  let dep = new Dep()
  // 遍历对象 进行数据劫持 给对象增加 get, set
  for (let key in data) {
    let val = data[key]
    observe(val) // 递归
    Object.defineProperty(data, key, {
      configurable: true,
      get() {
        Dep.target && dep.addSub(Dep.target) // 将watcher添加到订阅事件中
        return val
      },
      set(newVal) {
        if (val === newVal) return
        val = newVal
        observe(val) // 这里需要再次劫持，把新值重新定义成属性 有get, set方法
        dep.notify() // 发布 让所有watcher的update方法执行
      },
    })
  }
}

/**
 * 不用每次都调用new  这里统一管理
 * @param {*} data
 */

function observe(data) {
  if (!data || typeof data !== 'object' || data === null) return
  return new Observe(data)
}

/**
 *
 * @param {*} el 挂载实例
 * @param {*} vm vue对象
 */
function Compile(el, vm) {
  // 将el挂载到实例上
  vm.$el = document.querySelector(el)
  // 创建碎片的形式
  let fragment = document.createDocumentFragment()

  /*
    这里的操作相当于隐式声明了变量child 同时把vm.$el.firstChild取出来赋值给child并添加到碎片中
    这时vm.$el.firstChild为空了
  */
  while ((child = vm.$el.firstChild)) {
    fragment.appendChild(child) // 把节点移植过去到碎片中
  }

  // 对el里面的内容进行替换
  function replace(frag) {
    Array.from(frag.childNodes).forEach(function (node) {
      let txt = node.textContent
      let reg = /\{\{(.*?)\}\}/g // 匹配{{ }} 表达式

      if (node.nodeType === 3 && reg.test(txt)) {
        // 如果是文本节点 并且有{{}}
        // let arr = RegExp.$1.split('.')
        // let val = vm
        // arr.forEach((key) => {
        //   val = val[key] //  a.b.c
        // })
        // node.textContent = txt.replace(reg, val).trim()
        // new Watcher(vm, RegExp.$1, (newVal) => {
        //   console.log(12, newVal)
        //   node.textContent = txt.replace(reg, newVal).trim()
        // })
        ;(function placeText() {
          node.textContent = txt.replace(reg, (matched, placeholder) => {
            // matched 匹配的对象  例如 {{a}} {{b}}
            // placeholder 匹配到的分组  a b
            console.log(matched, placeholder)
            // 监听变化
            new Watcher(vm, placeholder, placeText)
            return placeholder.split('.').reduce((val, key) => {
              return val[key]
            }, vm)
          })
        })()
      }

      if (node.nodeType === 1) {
        // 元素节点
        let nodeArr = node.attributes
        ;[...nodeArr].forEach((attr) => {
          let name = attr.name // v-model='c'
          let exp = attr.value // c
          if (name.includes('v-')) {
            node.value = vm[exp]
            // 监听变化
            new Watcher(vm, exp, function (newVal) {
              node.value = newVal
            })
            // 监听事件input
            node.addEventListener('input', function (e) {
              let newVal = e.target.value
              vm[exp] = newVal
              console.log(vm)
            })
          }
        })
      }
      // 如果还有子节点，继续递归replace
      if (node.childNodes && node.childNodes.length) {
        replace(node)
      }
    })
  }
  replace(fragment)
  vm.$el.appendChild(fragment)
}

// 实现发布订阅
// 订阅就是把函数添加到数组， 发布就是让数组里的函数执行
function Dep() {
  this.subs = [] // 一个数组 用了存放事件 [fn1, fn2, fn3]
}
Dep.prototype.addSub = function (sub) {
  // 订阅
  this.subs.push(sub)
}
Dep.prototype.notify = function () {
  // 发布
  this.subs.forEach((sub) => sub.update())
}

/**
 *
 * @param {*} vm 实例
 * @param {*} exp 值
 * @param {*} fn 函数
 */
function Watcher(vm, exp, fn) {
  this.fn = fn
  this.vm = vm
  this.exp = exp
  Dep.target = this // 在Observe get方法 运用
  let val = vm
  let arr = exp.split('.')
  arr.forEach((key) => {
    val = val[key] // this.a.b 会触发get
  })
  Dep.target = null
}
Watcher.prototype.update = function () {
  // 先获取新值
  let val = this.vm
  let arr = this.exp.split('.')
  arr.forEach((key) => {
    val = val[key]
  })
  this.fn(val) // 更新
}

/**
 * 计算属性
 */
function initComputed() {
  let vm = this
  let computed = this.$options.computed
  Object.keys(computed).forEach((key) => {
    Object.defineProperty(vm, key, {
      // 这里判断是computed里的key是对象还是函数
      // 如果是函数直接就会调get方法
      // 如果是对象的话，手动调一下get方法即可
      // 如： sum() {return this.a + this.b;},他们获取a和b的值就会调用get方法
      // 所以不需要new Watcher去监听变化了
      get:
        typeof computed[key] === 'function' ? computed[key] : computed[key].get,
      set() {},
    })
  })
}
