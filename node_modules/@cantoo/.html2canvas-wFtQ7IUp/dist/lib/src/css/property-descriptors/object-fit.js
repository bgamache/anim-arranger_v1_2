"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.objectFit = void 0;
exports.objectFit = {
    name: 'object-fit',
    initialValue: 'fill',
    prefix: false,
    type: 2 /* PropertyDescriptorParsingType.IDENT_VALUE */,
    parse: function (_context, objectFit) {
        switch (objectFit) {
            case 'contain':
                return "contain" /* OBJECT_FIT.CONTAIN */;
            case 'cover':
                return "cover" /* OBJECT_FIT.COVER */;
            case 'none':
                return "none" /* OBJECT_FIT.NONE */;
            case 'scale-down':
                return "scale-down" /* OBJECT_FIT.SCALE_DOWN */;
            case 'fill':
            default:
                return "fill" /* OBJECT_FIT.FILL */;
        }
    }
};
//# sourceMappingURL=object-fit.js.map