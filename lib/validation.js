// Load modules

var Boom = require('boom');
var Hoek = require('hoek');
var Joi = require('joi');


// Declare internals

var internals = {};


exports.query = function (request, next) {

    return internals.input('query', request, next);
};


exports.payload = function (request, next) {

    return internals.input('payload', request, next);
};


exports.params = function (request, next) {

    return internals.input('params', request, next);
};


exports.headers = function (request, next) {

    return internals.input('headers', request, next);
};


internals.input = function (source, request, next) {

    if (typeof request[source] !== 'object') {
        return next(Boom.unsupportedMediaType(source + ' must represent an object'));
    }

    var postValidate = function (err, value) {

        request.orig[source] = request[source];
        if (value !== undefined) {
            request[source] = value;
        }

        if (!err) {
            return next();
        }

        // failAction: 'error', 'log', 'ignore', function (source, err, next)

        if (request.route.validate.failAction === 'ignore') {
            return next();
        }

        // Prepare error

        var error = Boom.badRequest(err.message, err);
        error.output.payload.validation = { source: source, keys: [] };
        if (err.details) {
            for (var i = 0, il = err.details.length; i < il; ++i) {
                error.output.payload.validation.keys.push(err.details[i].path);
            }
        }

        if (request.route.validate.errorFields) {
            var fields = Object.keys(request.route.validate.errorFields);
            for (var f = 0, fl = fields.length; f < fl; ++f) {
                var field = fields[f];
                error.output.payload[field] = request.route.validate.errorFields[field];
            }
        }

        request._log(['validation', 'error', source], error);

        // Log only

        if (request.route.validate.failAction === 'log') {
            return next();
        }

        // Custom handler

        if (typeof request.route.validate.failAction === 'function') {
            var reply = request.server._replier.interface(request, next);
            return request.route.validate.failAction(request, reply, source, error);
        }

        // Return error

        return next(error);
    };

    var localOptions = {
        context: {
            headers: request.headers,
            params: request.params,
            query: request.query,
            payload: request.payload
        }
    };

    delete localOptions.context[source];
    Hoek.merge(localOptions, request.connection.settings.validation);

    var schema = request.route.validate[source];
    if (typeof schema === 'function') {
        return schema(request[source], localOptions, postValidate);
    }

    return Joi.validate(request[source], schema, localOptions, postValidate);
};


exports.response = function (request, next) {

    if (request.route.response.sample) {
        var currentSample = Math.ceil((Math.random() * 100));
        if (currentSample > request.route.response.sample) {
            return next();
        }
    }

    var response = request.response;
    var statusCode = response.isBoom ? response.output.statusCode : response.statusCode;
    var source = response.isBoom ? response.output.payload : response.source;

    var statusSchema = request.route.response.status[statusCode];
    if (statusCode >= 400 &&
        !statusSchema) {

        return next();          // Do not validate errors by default
    }

    var schema = statusSchema || request.route.response.schema;
    if (schema === null) {
        return next();          // No rules
    }

    if ((!response.isBoom && request.response.variety !== 'plain') ||
        typeof source !== 'object') {

        return next(Boom.badImplementation('Cannot validate non-object response'));
    }

    var postValidate = function (err, value) {

        if (!err) {
            if (value !== undefined &&
                request.route.response.modify) {

                if (response.isBoom) {
                    response.output.payload = value;
                }
                else {
                    response.source = value;
                }
            }

            return next();
        }

        // failAction: 'error', 'log'

        if (request.route.response.failAction === 'log') {
            request._log(['validation', 'response', 'error'], err.message);
            return next();
        }

        return next(Boom.badImplementation(err.message));
    };

    var options = request.connection.settings.validation || {};
    if (typeof schema === 'function') {
        return schema(source, options, postValidate);
    }

    return Joi.validate(source, schema, options, postValidate);
};
