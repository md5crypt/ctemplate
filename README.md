# ctemplate - a template engine for C

the basic idea was to create a command line tool that would provide a uniform way of generating code in C projects. Normally in a typical project one would find:

* shell scripts
* python script
* *[insert random obscure or outdated scripting language]* scripts
* Makefiles bending space time
* psychopaths using recursive C marcos
* random .exe files

all doing the same task - some form of C code generation

This ctemplate tool allows user to create `*.c.ctemplate` and `*.h.template` files that are transformed into `*.c` and `*.h` files during compilation. This can be done for example by a simple Makefile rule.

The `*.ctemplate` files are c source / header files with injected blocks of javascript code. These blocks are evaluated and replaced with the result.

Each javascript block is injected with a `config` object that holds the project configuration. Project configuration is managed by the ctemplate tool and constructed from distributed JSON files.

## Template files

Below is a simple example of a `.h.ctemplate`

```c
#pragma once

<? C.defineGroup(config.uloop.defines, 'ULOOP_') ?>

#define ULOOP_LISTENER_COUNT      <? config.uloop.listeners.length ?>
#define ULOOP_LISTENER_TABLE_SIZE <? config.uloop.listeners.reduce((a,b) => a + b.events.length, 0) + config.uloop.events.length ?>
#define ULOOP_EVENT_COUNT         <? config.uloop.events.length ?>

<? config.uloop.events.map((event, i) => C.define(config.uloop.prefix + event.name, i)).join('') ?>
```

The `<? ?>` blocks include javascript code blocks to be evaluated. The result of the last expression in the block is inserted into the target file. If `undefined` is returned the block is simple removed.

Blocks can be also started with `<??` and `??>` sequences to remove a new lines before / after the block. This feature is for pedantic people that want their generated code to be supper pretty. Single and double quotes can be used in a single block, i.e. `<? ??>` will remove the newline after the block but leave the one before.

### Context isolation

An isolated context is created for each template file, but a single file shares the context for each block inside it. If a function is defined inside a block it will be visible in the next block in the same file but not in blocks of the next file.

### Global scope

The following elements are inserted into the global scope of the block execution context:

* `console`
* `require`
* `process`
* `assert`
* `config` - the configuration object
* `schemaVerify` - from minischema library
* `C` - object with helper functions for C code generation

Additionally all user defined members of the `ctemplate.export` configuration key are injected into the global scope.

## Configuration files

All configuration files passed to the tool are merged into a single object. Arrays are merged as well.

Configuration files can be JSON files or js files. JSON files are read and parsed as-is and js files are expected to evaluate into an object. Using js files allows for using comments and skipping quotes on members names in the configuration files.

### Key exploding

Member names names are exploded: `{"a.b.c.d": 42}` gets transformed into `{"a":{"b":{"c":{"d": 42}}}}` and then merged with the configuration object.

Consider the following two configuration files are defined:

```json
{
	"example.array": [1, 2],
	"example.something.a": 1,
	"someMember": 42
}
```

```json
{
	"example": {
		"array": [3,4],
		"something": {"b": 2}
	}
}
```

The resulting configuration files has the following structure:

```json
{
	"example": {
		"array": [1, 2, 3, 4],
		"something": {"a": 1, "b": 2}
	},
	"someMember": 42
}
```

The order of elements in `example.array` depends on the order with which the files where processed.


### Schema files

Any number of schema files can be provided to verify the configuration object. The [minischema](https://www.npmjs.com/package/minischema) library in non-strict mode is used to do the verification.

Schema files can be JSON files or js files just like in case of the configuration files.

Schema objects are exploded but not merged. Each schema is applied on the merged configuration object separately.

### Special keys

The `ctemplate` configuration key is reserved for internal use. Currently two internal configuration options are supported:

* `ctemplate.export`: all members in this object will be injected into the global scope of the environment in which code blocks are executed.
* `ctempate.preamble`: a string to add as a header to all generated files

## Code generation helper functions

The following helper function can be used form the template javascript blocks. The are all defined as members of the `C` global object.

These functions provide a more organized and uniform way for generating C code then simply concationg string. No one tells you to use them, sometimes it is much easier and cleaner to manually concat some code together.

#### `blob(data: Uint8Array)`

convert a binary array into a string, returned values includes quotes

```javascript
C.blob(new UInt8Array[1,a,3])) /* "\001a\003" */
```

### `variable(name: string, type: string, value?: string)`

declare a variable with an optional initializer, includes the trailing semicolon

```javascript
C.variable(test, "uint8_t", 0)
/* uint8_t test = 0; */
```

### `array(name: string, type: string, size?: string | number, value?: string)`

declare a array with an optional initializer, includes the trailing semicolon

```javascript
C.array(test, "uint8_t", 4, C.initializer([1, 2, 3, 4]))
/* uint8_t test[4] = {1,2,3,4}; */
```

### `struct(name: string, list: string[])`

return a structure definition with the given names and elements. Semicolons are appended between elements if missing. No semicolon is appended after the closing bracket.

```javascript
C.struct("test", [
	C.variable("a", "uint32_t"),
	C.variable("b", "uint32_t")
])
/* struct test {uint32_t a; uint32_t b;} */
```

### `union(name: string, list: string[])`

same as `struct` but for unions

### `typedef(name: string, type: string)`

returns a typedef definition, includes the trailing semicolon

```javascript
C.typedef("test_t",
	C.struct(undefined, [C.variable("a", "uint32_t")])
)
/* typedef struct {uint32_t a;} test_t; */
```

### `call(func: string, args: string[])`

create a function call expression

```javascript
C.call("memset", ["ptr", 0, 128])
/* memset(ptr, 0, 128) */
```

### `function(name: string, args: string[], ret: string)`

create a function definition

```javascript
C.function("sum", ["uint32_t a", "uint32_t b"] "uint32_t")
/* uint32_t sum(uint32_t a, uint32_t b) */
```

### `block(lines: string[])`

create a code block

```javascript
C.function("test", ["uint8_t* ptr"]) + C.block([
	C.call("memset", ["ptr", 0, 128]),
	"return"
])
/* void test(uint8_t* ptr){memset(ptr, 0, 128);return;} */
```

### `charArray(value: string)`

convert a string into a char array initializer

```javascript
C.charArray("test")
/* {'t', 'e', 's', 't'} */
```

### `define(name: string, value: string)`

create a preprocessor define, newline included

```javascript
C.define("ANSWER", 42)
/* #define ANSWER 42\n */
```

### `defineGroup(object: Object, prefix?: string, suffix?: string)`

convert key - value pairs into preprocessor defines. Camel case names get converted into uppercase names with underscores (`testName` => `TEST_NAME`)

```javascript
C.defineGroup({
	zero: 0,
	oneMoreThenZero: 1,
	exampleValue: 2,
	something: 3
}, "S_", "_P")
/*
#define S_ZERO_P 0
#define S_ONE_MORE_THEN_ZERO_P 1
#define S_EXAMPLE_VALUE_P 2
#define S_SOMETHING_P 3
*/
```

### `format(code: string, initialIndent?: number)`

pretty format C code with given initial indent level.

> Note: this very crude and simplified impregnation. It can break more complex stuff so use with care.

```javascript
C.format(C.function("test", ["uint8_t* ptr"]) + C.block([
	C.call("memset", ["ptr", 0, 128]),
	"return"
]))
/*
void test(uint8_t* ptr){
	memset(ptr, 0, 128);
	return;
}
*/
```

### `initializer(value: any)`

convert a value into a initializer

* for arrays recursively calls itself on each element and returns the elements separated with commas and wrapped in `{ }`
* for null returns `NULL`
* for object creates structure initializers in the `{.key=value, ...}` format,  recursively calls itself on values
* other values get simply converted into a string

## Vscode extension

A vscode extensions with syntax highlighting for `*.[ch].template` files is included in the release builds.

## Usage

Below is the tool help message

```
usage: ctemplate <file>+

templating engine for C

Parameters:
  file : Input .template files

Options:
  -h, --help             : Display help and exit
  -v, --verbose          : Display verbose output
  -c, --config <PATH>, + : Configuration .config.[js|json] files to use, if a directory is given all .config.[js|json] files will be used
  -s, --schema <PATH>, + : Schema .schema.[js|json] files to verify configuration against, if a directory is given all .schema.[js|json] files will be used
  -o, --output <PATH>    : File to create, by default input file with '.template' stripped
```

> Note: `--verbose` is useful for debugging template files as it displays full exceptions with stack traces

## Building

Should be simple as

* `npm install`
* `npm run build`
