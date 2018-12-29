var ScriptsLoader = (function () {
    /**
     * 缓存 <head> 元素
     */
    var headElement = document.head || document.getElementsByTagName('head')[0];

    // 如果没有找到 <head> 元素则抛出错误
    if (!headElement) {
        throw new Error('<head> element is not found in this document.');
    }

    /**
     * 脚本加载器类
     *
     * @class
     * @param {UrlPriorityMap} urlPriorityMap 配置信息
     */
    var ScriptsLoader = function(urlPriorityMap, settings) {
        var store = {};

        if (!urlPriorityMap || typeof urlPriorityMap !== 'object') {
            throw new TypeError('urlPriorityMap must be an object.');
        }

        if (!settings || typeof settings !== 'object') {
            settings = {};
        }

        store.urlPriorityMap = urlPriorityMap;
        store.settings = settings;
        store.list = [];
        store.started = false;

        this.store = parseUrlPriorityMap(store);
    };

    /**
     * 注册脚本加载生命周期回调函数
     *
     * 注意：最多只能注册一个生命周期函数，后面设置的会覆盖前面的。
     *
     * @param {(event: LifecycleEvent) => void} onlifecycle 生命周期回调函数
     * @returns {ScriptsLoader} 返回 this
     */
    ScriptsLoader.prototype.lifecycle = function (onlifecycle) {
        this.store.onlifecycle = onlifecycle;
        return this;
    };

    /**
     * 开始加载脚本，这个函数只能被调用一次，多余的调用将会被忽略
     *
     * @param {() => void} [onfinish] 下载完成回调
     * @returns {ScriptsLoader} 返回 this
     */
    ScriptsLoader.prototype.start = function (onfinish) {
        var store = this.store;

        // 如果已经开始则直接返回
        if (store.started) {
            return null;
        }

        var list = store.list;
        var settings = store.settings;
        var onlifecycle = store.onlifecycle;
        var fromIndex = 0;

        var start = function () {
            var loadList = getLoadList(list, fromIndex);

            if (loadList) {
                fromIndex = loadList.nextIndex;
                loadScripts(loadList.list, settings, onlifecycle, start);
            } else {
                var callback = onfinish;
                onfinish = null;
                callback && callback();
            }
        };

        store.started = true;

        start();

        return this;
    };

    /**
     * Url 和优先级键值对信息
     * @typedef {Object.<string, *>} UrlPriorityPair
     * @property {string} url 脚本地址
     * @property {number} priority 优先级
     */

    /**
     * @typedef {Object.<string, *>} LoadListInfo
     * @property {string[]} url 脚本地址列表
     * @property {number} nextIndex 下一次查找开始的位置
     */

    /**
     * 获取从指定位置开始优先级相同的 url
     *
     * @param {UrlPriorityPair[]} list 包含所有 UrlPriorityPair 的列表
     * @param {number} fromIndex 指定从哪个位置开始查找
     * @return {LoadListInfo} 返回 url 列表，和下一个位置信息。如果没有，则返回 null。
     */
    var getLoadList = function (list, fromIndex) {
        var first = list[fromIndex];

        if (first) {
            var priority = first.priority;
            var length = list.length;
            var loadList = [];
            var item;
            var nextIndex;

            loadList.push(first.url);

            fromIndex += 1;

            for ( ; fromIndex < length; fromIndex += 1) {
                item = list[fromIndex];
                if (item.priority === priority) {
                    loadList.push(item.url);
                } else {
                    nextIndex = fromIndex;
                    break;
                }
            }

            return {
                list: loadList,
                nextIndex: nextIndex
            };
        } else {
            return null;
        }
    };

    /**
     * 加载 urls 列表中的所有脚本
     *
     * @param {string[]} urls 脚本地址列表
     * @param {LoadScriptSettings} settings 脚本配置信息
     * @param {(event: LifecycleEvent) => void} onlifecycle 生命周期回调函数
     * @param {() => void} [onfinish] 下载完成回调
     */
    var loadScripts = function (urls, settings, onlifecycle, onfinish) {
        var i = 0;
        var total = urls.length;
        var loaded = 0;
        var finish = function () {
            loaded += 1;
            if (loaded >= total) {
                var callback = onfinish;
                onfinish = null;
                callback && callback();
            }
        };
        for ( ; i < total; i += 1) {
            loadScript(urls[i], settings, function (event) {
                if (onlifecycle) {
                    try {
                        onlifecycle(event);
                    } catch (e) {
                        // 不要阻塞当前的程序的执行
                        setTimeout(function () {
                            throw e;
                        });
                    }
                }
                if (event.finished) {
                    if (event.error) {
                        throw event;
                    } else {
                        finish();
                    }
                }
            });
        }
    };

    /**
     * 加载脚本生命周期事件
     * @typedef {Object} LifecycleEvent
     * @property {string} url 脚本 url
     * @property {Object} settings 配置信息
     * @property {boolean} error 是否出错
     * @property {boolean} finished 是否完成
     * @property {number} code 状态码
     * @property {string} type 状态文本
     * @property {string} message 提示信息
     *
     * code - type - 说明：
     *
     * 1 - EVENT_LOADING  - 加载中
     * 2 - EVENT_SUCCESS  - 加载成功
     * 3 - ERROR_TIMEOUT  - 已超时
     * 4 - ERROR_NETWORK  - 网络错误
     * 5 - ERROR_SETTINGS - 配置错误
     */

    /**
     * 加载脚本设置
     * @typedef {Object} LoadScriptSettings
     * @property {number} [timeout] 超时时间，没有设置或者设置为 0 表示一直等待
     * @property {Object.<string, *>} [attrs] 设置 script 标签属性
     */

    /**
     * @param {string} url 脚本地址
     * @param {LoadScriptSettings} settings 设置
     * @param {(event: LifecycleEvent) => void} onlifecycle 生命周期回调函数
     */
    var loadScript = function (url, settings, onlifecycle) {
        var script = document.createElement('script');
        var onloadSupported = 'onload' in script;
        var timeoutId = null;
        var finish = function (event) {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            if (onlifecycle) {
                var callback = onlifecycle;
                event.url = url;
                event.settings = settings;
                event.finished = true;
                // 将此函数设置为 null，确保以后不再执行
                onlifecycle = null;
                callback(event);
            }
        };

        if (!settings) {
            settings = {};
        }

        // 默认属性
        script.type = 'text/javascript';
        script.charset = 'utf-8';

        // 设置 script 标签 attrs
        if (settings.attrs) {
            var key;
            var attrs = settings.attrs;
            for (key in attrs) {
                if (attrs.hasOwnProperty(key)) {
                    script.setAttribute(key, attrs[key]);
                }
            }
        }

        // 设置链接
        script.src = url;

        // 设置超时时间
        if (settings.timeout) {
            var timeout = parseInt(settings.timeout);
            if (isNaN(timeout)) {
                finish({
                    error: true,
                    code: 5,
                    type: 'ERROR_SETTINGS',
                    message: 'timeout is not an number'
                });
            } else {
                timeoutId = setTimeout(function () {
                    timeoutId = null;
                    finish({
                        error: true,
                        code: 3,
                        type: 'ERROR_TIMEOUT',
                        message: 'timeout'
                    });
                }, timeout);
            }
        }

        // 监听脚本加载完成事件
        if (onloadSupported) {
            script.onload = function () {
                finish({
                    error: false,
                    code: 2,
                    type: 'EVENT_SUCCESS',
                    message: 'finished'
                });
            };
        } else {
            script.onreadystatechange = function () {
                if (script.readyState === 'complete' ||
                    script.readyState === 'loaded')
                {
                    finish({
                        error: false,
                        code: 2,
                        type: 'EVENT_SUCCESS',
                        message: 'finished'
                    });
                }
            };
        }

        // 设置错误回调
        script.onerror = function () {
            finish({
                error: true,
                code: 3,
                type: 'ERROR_NETWORK',
                message: 'Network Error'
            });
        };

        // 触发开始加载事件
        if (onlifecycle) {
            onlifecycle({
                url: url,
                settings: settings,
                finished: false,
                error: false,
                code: 1,
                type: 'EVENT_LOADING',
                message: 'start loading'
            });
        }

        headElement.appendChild(script);
    };

    /**
     * 解析 Url 与优先级映射表
     *
     * @param {ScriptsLoader#store} ScriptsLoader 的 store 属性
     * @return {Object} 返回修改过的 store
     */
    var parseUrlPriorityMap = function (store) {
        var urlPriorityMap = store.urlPriorityMap;
        var list = [];
        var key;
        var val;
        var item;

        for (key in urlPriorityMap) {
            if (urlPriorityMap.hasOwnProperty(key)) {
                val = urlPriorityMap[key];
                item = {};

                if (typeof val === 'number') {
                    item.priority = val;
                } else if (typeof val === 'string') {
                    item.priority = parseInt(val, 10);
                } else {
                    throw new TypeError('priority must be numberLike. got: ' +
                                        (typeof val) + ', value is: ' + val +
                                        ', path is: ' + key);
                }

                if (isNaN(item.priority)) {
                    throw new TypeError('priority is not a numberLike. got: ' +
                                         val + ', path is: ' + key);
                }

                item.url = key;

                list.push(item);
            }
        }

        list.sort(function (a, b) {
            return a.priority - b.priority;
        });

        store.list = list;

        return store;
    };

    /**
     * Url 和优先级映射表，键名为 url，键值为优先级
     * @typedef {Object.<string, number>} UrlPriorityMap
     */

    /**
     * 使用指定的 urlPriorityMap 创建一个 ScriptLoader
     *
     * @param {UrlPriorityMap} urlPriorityMap Url 和优先级映射表
     * @returns {ScriptsLoader}
     */
    ScriptsLoader.load = function (urlPriorityMap, settings) {
        return new ScriptsLoader(urlPriorityMap, settings);
    };

    /**
     * 暴露接口
     */
    return ScriptsLoader;
})();
