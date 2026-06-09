class Pipeline {
    constructor() {
        this.steps = [];
        this.context = {};
        this.errorHandler = null;
        this.successHandler = null;
    }

    do(fn) {
        this.steps.push(fn);
        return this;
    }

    onError(handler) {
        this.errorHandler = handler;
        return this;
    }

    onSuccess(handler) {
        this.successHandler = handler;
        return this;
    }

    async run(initialContext = {}) {
        this.context = { ...initialContext, error: null };

        for (const step of this.steps) {
            try {
                const result = await step(this.context);

                if (result && typeof result === 'object') {
                    this.context = { ...this.context, ...result };

                    if (this.context.error) {
                        break;
                    }
                }
            } catch (unhandledError) {
                this.context.error = { code: 1, message: unhandledError.message };
                break;
            }
        }

        if (this.context.error && this.errorHandler) {
            const { error, ...context } = this.context;

            if(error.code === -1 && this.successHandler){
                return await this.successHandler(this.context);
            }

            await this.errorHandler(error, context);

        } else if (this.successHandler) {
            await this.successHandler(this.context);
        }

        return this.context;
    }
}

export const pipeline = () => new Pipeline();