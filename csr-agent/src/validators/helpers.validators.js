import validator from 'validator';

const required =
  (fn) =>
  (value, ...args) =>
    !(value === undefined || value === null) &&
    fn(...[String(value), ...args]);

export const standardString = (path, message, overrideConfig = {}) => [
  path,
  [
    [
      required(validator.isLength),
      message,
      [{ min: 2, max: 200, ...overrideConfig }],
    ],
  ],
];

export const standardUrl = (path, message, overrideOptions = {}) => [
  path,
  [
    [
      required(validator.isURL),
      message,
      [
        {
          require_protocol: true,
          require_valid_protocol: true,
          protocols: ['http', 'https'],
          require_host: true,
          require_port: false,
          allow_protocol_relative_urls: false,
          allow_fragments: false,
          allow_query_components: true,
          validate_length: true,
          ...overrideOptions,
        },
      ],
    ],
  ],
];

export const standardNaturalNumber = (path, message) => [
  path,
  [
    [
      required((value) =>
        validator.isNumeric(String(value), { no_symbols: true })
      ),
      message,
    ],
  ],
];

export const getValidateMessages = (validatorConfigs, item) =>
  validatorConfigs.flatMap(([path, validators]) => {
    return validators.reduce((acc, [validatorFn, message, args = []]) => {
      const valueToValidate = path.reduce((val, property) => val[property], item);
      if (!validatorFn(...[valueToValidate, ...args])) {
        return acc.concat(message);
      }
      return acc;
    }, []);
  });

export const optional =
  (fn) =>
  (...args) => {
    const [path, validators] = fn(...args);
    return [
      path,
      validators.map(([fn, message, validatorArgs]) => [
        (value, ...args) =>
          value === undefined ? true : fn(...[value, ...args]),
        message,
        validatorArgs,
      ]),
    ];
  };
