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
    var ScriptsLoader = function(urlPriorityMap) {
        var store = {};

        if (!urlPriorityMap || typeof urlPriorityMap !== 'object') {
            throw new TypeError('urlPriorityMap must be an object.');
        }

        store.urlPriorityMap = urlPriorityMap;
        store.list = [];
        store.started = false;

        this.store = parseUrlPriorityMap(store);
    };

    /**
     * 开始加载脚本，这个函数只能被调用一次，多余的调用将会被忽略
     *
     * @param {() => void} [onfinish] 下载完成回调
     */
    ScriptsLoader.prototype.start = function (onfinish) {
        var store = this.store;

        // 如果已经开始则直接返回
        if (store.started) {
            return null;
        }

        var list = store.list;
        var fromIndex = 0;
        var length = list.length;

        var start = function () {
            var loadList = getLoadList(list, fromIndex);

            if (loadList) {
                fromIndex = loadList.nextIndex;
                loadScripts(loadList.list, start);
            } else {
                onfinish && onfinish();
            }
        };

        store.started = true;

        start();
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
     * @param {() => void} [callback] 下载完成回调
     */
    var loadScripts = function (urls, callback) {
        var i = 0;
        var total = urls.length;
        var loaded = 0;
        var done = function () {
            loaded += 1;
            if (loaded >= total) {
                callback && callback();
            }
        };
        for ( ; i < total; i += 1) {
            loadScript(urls[i], done);
        }
    };

    /**
     * 加载指定的脚本
     *
     * @param {string} url 脚本位置
     * @param {() => void} [callback] 下载完成回调
     */
    var loadScript = function (url, callback) {
        var script = document.createElement('script');
        var finish = function () {
            var fn = callback;

            callback = null;
            script.onload = null;
            script.onerror = null;
            script.onreadystatechange = null;
            script = null;
            finish = null;

            fn && fn();
        };

        script.type = 'text/javascript';
        script.charset = 'utf-8';
        script.src = url;

        if ('onload' in script) {
            script.onload = finish;
        } else {
            script.onreadystatechange = function () {
                if (script.readyState === 'complete' ||
                    script.readyState === 'loaded')
                {
                    finish();
                }
            };
        }

        script.onerror = finish;

        headElement.appendChild(script);
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
    ScriptsLoader.load = function (urlPriorityMap) {
        return new ScriptsLoader(urlPriorityMap);
    };

    /**
     * 暴露接口
     */
    return ScriptsLoader;
})();
