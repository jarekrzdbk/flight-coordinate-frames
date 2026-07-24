"use strict";

const D2R = Math.PI / 180;
const EPS = 1e-7;

const SYMBOL = Object.freeze({
    psi: "\u03C8",
    track: "\u03A8",
    theta: "\u03D1",
    flightPath: "\u0398",
    phi: "\u03C6",
    gamma: "\u03B3",
    alpha: "\u03B1",
    beta: "\u03B2",
    subA: "\u2090",
    prime: "\u2032",
    doublePrime: "\u2033",
    subS: "\u209B",
    subT: "\u209C",
    subK: "\u2096",
    subP: "\u209A"
});

const COLORS = Object.freeze({
    psi: "#c96a10",
    theta: "#7a1fa2",
    phi: "#0e7c7b",
    x: "#c62828",
    y: "#2e7d32",
    z: "#1a4fd6",
    ink: "#1b2430",
    grey: "#8a9096"
});

const STAGE_ANGLES = [SYMBOL.psi, SYMBOL.theta, SYMBOL.phi];
const STAGE_COLORS = [COLORS.psi, COLORS.theta, COLORS.phi];
const FRAME_CODES = ["S", "T", "K", "P"];
const AXIS_INDEX = {x: 0, y: 1, z: 2};

const CONFIG = Object.freeze({
    ned: {
        shortName: "NED navigation: Xn north, Yn east, Zn down · right-handed (Xn × Yn = Zn).",
        referenceLabels: ["Xn", "Yn", "Zn"],
        sequences: {krylov: ["z", "y", "x"], euler: ["z", "y", "z"]},
        trajectory: ["z", "y"],
        airBody: ["z", "y"],
        numbers: [3, 2, 1],
        up: new THREE.Vector3(0, 0, -1),
        defaultAzimuth: -3 * Math.PI / 4,
        projection: [
            [-1 / Math.sqrt(2), 1 / Math.sqrt(6)],
            [1 / Math.sqrt(2), 1 / Math.sqrt(6)],
            [0, -2 / Math.sqrt(6)]
        ]
    },
    ground: {
        shortName: "Aircraft-centred normal ground: axes parallel to fixed ground, Yg up, and Xg × Yg = Zg.",
        referenceLabels: ["Xg", "Yg", "Zg"],
        sequences: {krylov: ["y", "z", "x"], euler: ["y", "z", "y"]},
        trajectory: ["y", "z"],
        airBody: ["y", "z"],
        numbers: [3, 1, 2],
        up: new THREE.Vector3(0, 1, 0),
        defaultAzimuth: Math.PI / 4,
        projection: [
            [1 / Math.sqrt(2), -1 / Math.sqrt(6)],
            [0, 2 / Math.sqrt(6)],
            [-1 / Math.sqrt(2), -1 / Math.sqrt(6)]
        ]
    }
});

const state = {
    convention: "ground",
    transformation: "attitude",
    mode: "krylov",
    labels: "xyz",
    angleSets: {
        attitude: [30, 20, 25],
        trajectory: [30, 20, 0],
        airDirection: [30, 20, 0],
        airBank: [25, 0, 0],
        airVelocity: [30, 20, 25],
        airBody: [5, 8, 0]
    },
    target: [30, 20, 25],
    shown: [30, 20, 25],
    step: 3,
    animating: false
};

const $ = id => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const identity = () => new THREE.Matrix4().identity();
const matrixColumn = (matrix, index) =>
    new THREE.Vector3().setFromMatrixColumn(matrix, index);

function rotationMatrix(axis, angle) {
    const matrix = new THREE.Matrix4();
    if (axis === "x") return matrix.makeRotationX(angle);
    if (axis === "y") return matrix.makeRotationY(angle);
    return matrix.makeRotationZ(angle);
}

function isAttitudeTransformation() {
    return state.transformation === "attitude";
}

function usesNumberedLabels() {
    return isAttitudeTransformation() && state.labels === "numbered";
}

function activeAxes() {
    const config = CONFIG[state.convention];
    if (state.transformation === "trajectory") return config.trajectory;
    if (state.transformation === "airDirection") return config.sequences.krylov.slice(0, 2);
    if (state.transformation === "airBank") return ["x"];
    if (state.transformation === "airVelocity") return config.sequences.krylov;
    if (state.transformation === "airBody") return config.airBody;
    return config.sequences[state.mode];
}

function activeAngleSymbols() {
    if (state.transformation === "trajectory") return [SYMBOL.track, SYMBOL.flightPath];
    if (state.transformation === "airDirection")
        return [`${SYMBOL.psi}${SYMBOL.subA}`, `${SYMBOL.theta}${SYMBOL.subA}`];
    if (state.transformation === "airBank") return [`${SYMBOL.gamma}${SYMBOL.subA}`];
    if (state.transformation === "airVelocity")
        return [`${SYMBOL.psi}${SYMBOL.subA}`, `${SYMBOL.theta}${SYMBOL.subA}`, `${SYMBOL.gamma}${SYMBOL.subA}`];
    if (state.transformation === "airBody") return [SYMBOL.beta, SYMBOL.alpha];
    return STAGE_ANGLES;
}

function stageColor(stage) {
    return state.transformation === "airBank" ? COLORS.phi : STAGE_COLORS[stage];
}

function maximumStep() {
    return activeAxes().length;
}

function sourceAxisLabels() {
    if (state.transformation === "airBank") return ["X1a", "Y1a", "Z1a"];
    if (state.transformation === "airBody") return ["Xa", "Ya", "Za"];
    return CONFIG[state.convention].referenceLabels;
}

function targetAxisLabels() {
    if (state.transformation === "trajectory") return ["Xk", "Yk", "Zk"];
    if (state.transformation === "airDirection") return ["X1a", "Y1a", "Z1a"];
    if (state.transformation === "airBank") return ["Xa", "Ya", "Za"];
    if (state.transformation === "airVelocity") return ["Xa", "Ya", "Za"];
    return ["X", "Y", "Z"];
}

function orientationData() {
    const frames = [identity()];
    const stages = [];
    const axes = activeAxes();

    for (let stage = 0; stage < axes.length; stage++) {
        const start = frames[stage];
        const angle = stage < state.step ? state.shown[stage] * D2R : 0;
        const fixedIndex = AXIS_INDEX[axes[stage]];
        const end = start.clone().multiply(rotationMatrix(axes[stage], angle));

        if (Math.abs(end.determinant() - 1) > 1e-10)
            throw new Error("Orientation frame is not right-handed.");
        frames.push(end);
        stages.push({
            start,
            end,
            angle,
            fixedIndex,
            axisWorld: matrixColumn(start, fixedIndex).normalize(),
            moved: Math.abs(angle) < EPS
                ? []
                : [0, 1, 2].filter(axis => axis !== fixedIndex)
        });
    }

    return { frames, stages };
}

function gimbalInfo() {
    const axes = activeAxes();
    if (axes.length !== 3) return {enabled: false};

    const middle = state.target[1] * D2R;
    const properEuler = isAttitudeTransformation() && state.mode === "euler";
    const singularMetric = properEuler ? Math.abs(Math.sin(middle)) : Math.abs(Math.cos(middle));
    const distance = Math.asin(clamp(singularMetric, 0, 1));
    const frames = [identity()];
    for (let stage = 0; stage < axes.length; stage++)
        frames.push(frames.at(-1).clone().multiply(
            rotationMatrix(axes[stage], state.target[stage] * D2R)
        ));

    const firstAxis = matrixColumn(frames[0], AXIS_INDEX[axes[0]]).normalize();
    const thirdAxis = matrixColumn(frames[2], AXIS_INDEX[axes[2]]).normalize();
    const dot = firstAxis.dot(thirdAxis);
    const status = singularMetric < 1e-6 ? "locked"
        : singularMetric < 0.1 ? "near"
        : "normal";

    return {
        enabled: true,
        status,
        properEuler,
        distance,
        firstAxis,
        thirdAxis,
        relation: dot >= 0 ? "aligned" : "opposite",
        axisNames: [
            sourceAxisLabels()[AXIS_INDEX[axes[0]]],
            targetAxisLabels()[AXIS_INDEX[axes[2]]]
        ],
        lockAngles: properEuler ? [0, 180] : [-90, 90]
    };
}

function plainLabels(frame) {
    if (!usesNumberedLabels()) {
        if (frame === 0) return sourceAxisLabels();
        if (frame === maximumStep()) return targetAxisLabels();
        if (state.transformation === "airVelocity" && frame === 2)
            return ["X1a", "Y1a", "Z1a"];
        const mark = frame === 1 ? SYMBOL.prime : SYMBOL.doublePrime;
        return [`X${mark}`, `Y${mark}`, `Z${mark}`];
    }

    const suffix = [
        SYMBOL.subS,
        SYMBOL.subT,
        SYMBOL.subK,
        SYMBOL.subP
    ][frame];

    return CONFIG[state.convention].numbers.map(axis => `${axis}${suffix}`);
}

function frameLabels() {
    const labels = FRAME_CODES.slice(0, maximumStep() + 1).map((_, frame) => [...plainLabels(frame)]);
    const axes = activeAxes();

    for (let stage = 0; stage < state.step; stage++) {
        const fixed = AXIS_INDEX[axes[stage]];
        labels[stage][fixed] += `, ${labels[stage + 1][fixed]}`;
        labels[stage + 1][fixed] = null;
    }

    return labels;
}

function currentFrameLabel(labels, axis) {
    return labels[state.step][axis] ||
        (state.step > 0 ? labels[state.step - 1][axis] : null);
}

function frameName(frame) {
    if (usesNumberedLabels()) return FRAME_CODES[frame];
    return plainLabels(frame).join("/");
}

function stageArcText(stage) {
    const axis = activeAxes()[stage];
    return `${activeAngleSymbols()[stage]} about +${plainLabels(stage)[AXIS_INDEX[axis]]}`;
}
