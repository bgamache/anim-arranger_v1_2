import { Bounds } from '../css/layout/bounds';
import { OBJECT_FIT } from '../css/property-descriptors/object-fit';
export declare const calculateObjectFitBounds: (objectFit: OBJECT_FIT, naturalWidth: number, naturalHeight: number, clientWidth: number, clientHeight: number) => {
    src: Bounds;
    dest: Bounds;
};
