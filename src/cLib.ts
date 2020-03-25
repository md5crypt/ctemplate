export class Clib {
	static blob(data: Uint8Array) {
		let out = ""
		for (let i = 0; i < data.length; i++) {
			const c = data[i]
			if ((c == 34) || (c == 63) || (c == 92)) {
				out += "\\" + String.fromCharCode(c)
			} else {
				out += ((c >= 32) && (c <= 126)) ? String.fromCharCode(c) : ("\\" + (c).toString(8).padStart(3, "0"))
			}
		}
		return '"' + out + '"'
	}
	static struct(name: string, list: string[]) {
		return `struct ${name || ""}{${list.map(x => x.match(/;\s*$/) ? x : (x + ";")).join(" ")}}`
	}
	static union(name: string, list: string[]) {
		return `union ${name || ""}{${list.map(x => x.match(/;\s*$/) ? x :(x + ";")).join(" ")}}`
	}
	static typedef(name: string, type: string) {
		return `typedef ${type} ${name};`
	}
	static array(name: string, type: string, size?: string | number, value?: string) {
		return `${type} ${name}[${(size == undefined) ? "" : size}]${value ? (" = " + value) : ""};`
	}
	static variable(name: string, type: string, value?: string) {
		return `${type} ${name}${value ? (" = " + value) : ""};`
	}
	static call(func: string, args: string[]) {
		return `${func}(${args.join(", ")})`
	}
	static function(name: string, args: string[], ret?: string) {
		return `${ret || "void"} ${name}(${args.join(", ")})`
	}
	static block(lines: string[]) {
		return `{${lines.map(x => x.match(/;\s*$/) ? x : (x + ";")).join("")}}`
	}
	static charArray(value: string) {
		let out = []
		for (let i = 0; i < value.length; i++) {
			const c = value.charCodeAt(i)
			if ((c == 39) || (c == 63) || (c == 92)) {
				out.push("\\" + value[i])
			} else {
				out.push(((c >= 32) && (c <= 126)) ? value[i] : ("\\" + (c).toString(8).padStart(3, "0")))
			}
		}
		return "{" + out.map(x => `'${x}'`).join(",") + "}"
	}
	static define(name: string, value: string) {
		return `#define ${name} ${value}\n`
	}
	static defineGroup(object: Object, prefix?: string, suffix?: string) {
		return Object.entries(object).map(([key, value]) => (
			`#define ${prefix || ""}${key.replace(/[A-Z]/g, m => "_" + m).toUpperCase()}${suffix || ""} ${value}`
		)).join("\n")
	}
	static format(code: string, initialIndent?: number) {
		let indent = "\t".repeat(initialIndent || 0)
		let mode = 0
		return code
			.replace(/("(?:\\"|[^"])+"|'\\''|'[^']')|([\t\n\r]+)/g, (_, string, _ws) => string ? string : "")
			.replace(/(=\s*\{)|(\{)|([,;}])|("(?:\\"|[^"])+"|'\\''|'[^']')/g, (_, open1, open2, symbol, string) => {
				if (string) {
					return string
				} else if (open1) {
					indent += "\t"
					mode += 1
					return "= {\n" + indent
				} else if (open2) {
					indent += "\t"
					mode = mode > 0 ? (mode + 1) : 0
					return "{\n" + indent
				} else if (symbol == "}") {
					indent = indent.slice(1)
					mode = mode > 0 ? (mode - 1) : 0
					return "\n" + indent + "}"
				} else if (symbol == ";") {
					return ";\n" + indent
				} else if (symbol == ",") {
					return mode > 0 ? (",\n" + indent) : ","
				}
			}).replace(/\n(\t*)[ ]+|\n[\t ]+\n/g, "\n$1").trimRight()
	}
	static initializer(value: any): string {
		if (Array.isArray(value)) {
			return "{" + value.map(Clib.initializer).join(", ") + "}"
		} else if (value === null) {
			return "NULL"
		} else if (typeof value === "object") {
			return "{" + Object.entries(value).map(([k, v]) => `.${k} = ${Clib.initializer(v)}`).join(", ") + "}"
		} else {
			return `${value}`
		}
	}
}

