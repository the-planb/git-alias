export function Failure(code, message, extra = {}) {
    return {
        error: { code, message },
        ...extra
    };
}

export function Cancel(message = 'Operación cancelada.', extra = {}) {
    return {
        error: { code: 130, message },
        ...extra
    };
}

export function Success(extra = {}) {
    return {
        error: null,
        ...extra
    };
}
export function Break(message = '', extra = {}) {
    return {
        error: { code: -1, message },
        ...extra
    };
}