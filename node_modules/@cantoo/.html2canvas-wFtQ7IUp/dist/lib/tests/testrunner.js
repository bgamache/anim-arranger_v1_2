"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
var reftests_1 = require("../build/reftests");
var platform_1 = __importDefault(require("platform"));
var es6_promise_1 = require("es6-promise");
if (typeof window.Promise === 'undefined') {
    Object.assign(window, { Promise: es6_promise_1.Promise });
}
var uploadResults = function (canvas, url) {
    return new Promise(function (resolve, reject) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        var xhr = 'withCredentials' in new XMLHttpRequest() ? new XMLHttpRequest() : new XDomainRequest();
        xhr.onload = function () {
            if (typeof xhr.status !== 'number' || xhr.status === 200) {
                resolve();
            }
            else {
                reject("Failed to send screenshot with status ".concat(xhr.status));
            }
        };
        xhr.onerror = reject;
        var request = {
            screenshot: canvas.toDataURL(),
            test: url,
            platform: {
                name: platform_1.default.name || '',
                version: platform_1.default.version || ''
            },
            devicePixelRatio: window.devicePixelRatio || 1,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight
        };
        xhr.open('POST', 'http://localhost:8000/screenshot', true);
        xhr.send(JSON.stringify(request));
    });
};
describe('Rendering Tests', function () {
    var testContainer;
    beforeEach(function () {
        testContainer = document.createElement('iframe');
        var windowWidth = 800;
        var windowHeight = 600;
        testContainer.width = windowWidth.toString();
        testContainer.height = windowHeight.toString();
        testContainer.style.visibility = 'hidden';
        testContainer.style.position = 'fixed';
        testContainer.style.left = '10000px';
        document.body.appendChild(testContainer);
    });
    afterEach(function () {
        document.body.removeChild(testContainer);
    });
    reftests_1.testList
        .filter(function (test) {
        return !Array.isArray(reftests_1.ignoredTests[test]) || reftests_1.ignoredTests[test].indexOf(platform_1.default.name || '') === -1;
    })
        .forEach(function (url) {
        it("Should render untainted canvas for ".concat(url), function (done) {
            var hasHistoryApi = typeof window.history !== 'undefined' && typeof window.history.replaceState !== 'undefined';
            testContainer.onload = function () { return __awaiter(void 0, void 0, void 0, function () {
                var contentWindow, canvas;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            contentWindow = testContainer.contentWindow;
                            if (!contentWindow) {
                                throw new Error('Window not found for iframe');
                            }
                            contentWindow.addEventListener('unhandledrejection', function (event) {
                                console.error(event.reason);
                                throw new Error("unhandledrejection: ".concat(JSON.stringify(event.reason)));
                            });
                            return [4 /*yield*/, contentWindow.html2canvas(contentWindow.forceElement ||
                                    contentWindow.document.documentElement, __assign({ removeContainer: true, backgroundColor: '#ffffff', proxy: 'http://localhost:8081/proxy' }, (contentWindow.h2cOptions || {})))];
                        case 1:
                            canvas = _a.sent();
                            try {
                                canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
                            }
                            catch (e) {
                                throw new Error('Canvas is tainted');
                            }
                            return [4 /*yield*/, uploadResults(canvas, url)];
                        case 2:
                            _a.sent();
                            done();
                            return [2 /*return*/];
                    }
                });
            }); };
            testContainer.src = url + '?selenium&run=false&reftest&' + Math.random();
            if (hasHistoryApi) {
                try {
                    history.replaceState(null, '', url);
                }
                catch (e) { }
            }
        });
    });
});
//# sourceMappingURL=testrunner.js.map