import { CliMan } from "climan"
import * as fs from "fs"
import * as path from "path"
import * as vm from "vm"
import * as assert from "assert"
import { schemaVerify } from "minischema"
import { Clib } from "./cLib"

interface Options {
	config: string[]
	schema: string[]
	output: string
	verbose: boolean
}

type Dict = {[key:string]: any}

function isDict(o: any): o is Dict {
	return o && (typeof o === "object") && !Array.isArray(o)
}

function die(reason: string) {
	console.error("(error) " + reason)
	process.exit(1)
}

function merge(dest: Dict, src: Dict, path: string[]) {
	for (let key in src) {
		if (key in dest) {
			if (isDict(dest[key]) && isDict(src[key])) {
				merge(dest[key], src[key], [...path, key])
			} else if (Array.isArray(dest[key]) && Array.isArray(src[key])) {
				dest[key].push(...src[key])
			} else {
				throw new Error(`merging of key '${[...path, key].join(".")}' failed`)
			}
		} else {
			dest[key] = src[key]
		}
	}
}

function explode(o: Dict, path: string[]) {
	Object.keys(o).forEach(key => {
		const list = key.split(".")
		const value = o[key]
		if (list.length > 1) {
			delete o[key]
			const head: Dict = {}
			const tail = list.slice(0, -1).reduce((o, key) => (o[key] = {}, o[key]), head)
			tail[list[list.length - 1]] = value
			merge(o, head, [...path, list[0]])
			if (isDict(value)) {
				explode(value, list)
			}
		} else if (isDict(value)) {
			explode(value, [...path, key])
		}
	})
	return o
}

function readFile(file: string, verbose: boolean) {
	if (verbose) {
		console.log(`reading '${file}'...`)
	}
	const data = fs.readFileSync(file, "utf8")
	let object: any
	try {
		if (path.extname(file) == ".js") {
			object = eval(data)
		} else {
			object = JSON.parse(data)
		}
		if (!isDict(object)) {
			if (verbose) {
				console.log(object)
			}
			die(`file '${file}' did not resolve into an object`)
		}
	} catch (e) {
		if (verbose) {
			console.error(e)
		}
		die(`failed to parse file '${file}'\ * ${(e as Error).message}`)
	}
	return {data: object as Dict, file}
}

function readPath(value: string, regexp: RegExp, verbose: boolean) {
	if (!fs.existsSync(value)) {
		die(`path '${value}' does not exist`)
	}
	if (fs.lstatSync(value).isDirectory()) {
		return fs.readdirSync(value)
			.filter(x => x.match(regexp))
			.map(x => readFile(path.resolve(value, x), verbose))
	} else {
		return [readFile(value, verbose)]
	}
}

function processFiles(files: string[], options: Options) {
	const config = options.config
		.map(x => readPath(x, /\.config\.(js|json)$/, options.verbose), [])
		.reduce((a, b) => (a.push(...b), a), [])
		.reduce((output, object) => {
			if (options.verbose) {
				console.log(`applying '${object.file}'...`)
			}
			try {
				merge(output, explode(object.data, []), [])
			} catch (e) {
				if (options.verbose) {
					console.error(e)
				}
				die(`failed to process file '${object.file}'\n * ${(e as Error).message}`)
			}
			return output
		}, {} as Dict)
	options.schema
		.map(x => readPath(x, /\.schema\.(js|json)$/, options.verbose), [])
		.reduce((a, b) => (a.push(...b), a), [])
		.forEach(object => {
			if (options.verbose) {
				console.log(`verifying '${object.file}'...`)
			}
			try {
				schemaVerify(config, explode(object.data, []), "config", false)
			} catch (e) {
				if (options.verbose) {
					console.error(e)
				}
				die(`schema file '${object.file}' mismatch\n * ${(e as Error).message}`)
			}
		})
	if (options.output && (files.length != 1)) {
		die("output option is meaningful only when one input file is given")
	}
	if (!config.ctemplate) {
		config.ctemplate = {}
	}
	const sandbox = {
		config,
		console,
		require,
		process,
		schemaVerify,
		C: Clib,
		assert,
		...(config.ctemplate.export || {})
	}
	for (const file of files) {
		let output = options.output
		if (!output) {
			const match = file.match(/^(.+)[.]template$/)
			if (!match) {
				die("for input files not ending with '.template' --output option must be provided")
			} else {
				output = match[1]
			}
		}
		if (!fs.existsSync(file)) {
			die(`input file '${file}' does not exist`)
		}
		if (options.verbose) {
			console.log(`executing '${file}'...`)
		}
		try {
			const context = vm.createContext(sandbox)
			const result = fs.readFileSync(file, "utf8").replace(/(?:\r?\n?<\?\?|<\?)(.+?)(?:\?\?>\r?\n?|\?>)/gs, (_, code) => {
				const output = vm.runInContext(code, context)
				return output === undefined ? "" : output
			})
			fs.writeFileSync(output, config.ctemplate.preamble ? config.ctemplate.preamble + result : result)
		} catch (e) {
			if (options.verbose) {
				console.error(e)
			}
			die(e.message)
		}
	}
}

CliMan.run({
	name: "ctemplate",
	help: "templating engine for C",
	options: [
		{
			name: "help",
			symbol: "h",
			help: "Display help and exit",
			boolean: true,
			handler: CliMan.help
		},
		{
			name: "verbose",
			help: "Display verbose output",
			symbol: "v",
			boolean: true
		},
		{
			name: "config",
			symbol: "c",
			valueName: "PATH",
			help: "Configuration .config.[js|json] files to use, if a directory is given all .config.[js|json] files will be used",
			repeatable: true
		},
		{
			name: "schema",
			symbol: "s",
			valueName: "PATH",
			help: "Schema .schema.[js|json] files to verify configuration against, if a directory is given all .schema.[js|json] files will be used",
			repeatable: true
		},
		{
			name: "output",
			valueName: "PATH",
			symbol: "o",
			help: "File to create, by default input file with '.template' stripped"
		}
	],
	parameters: [
		{
			name: "file",
			help: "Input .template files",
			repeatable: true
		}
	],
	handler: processFiles
})
