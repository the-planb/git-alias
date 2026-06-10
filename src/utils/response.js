export function Failure(code, message, extra = {}) {
    return {
        exit: code,
        error: { code, message },
        ...extra
    };
}

export function Cancel(message = 'Operación cancelada.', extra = {}) {
    return {
        exit: 130,
        error: { code: 130, message },
        ...extra
    };
}

export function Success(extra = {}) {
    return {
        exit: 0,
        error: null,
        ...extra
    };
}
export function Skip(message = '', extra = {}) {
    return {
        exit: -1,
        error: { code: -1, message },
        ...extra
    };
}