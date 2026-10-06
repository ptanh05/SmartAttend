package vn.edu.utc.smartattend.system;

import java.util.regex.Pattern;

final class Json {
    private Json() {}

    static String object(Object... keyValues) {
        if (keyValues.length % 2 != 0) throw new IllegalArgumentException("JSON object requires key/value pairs");

        var json = new StringBuilder("{");
        for (var index = 0; index < keyValues.length; index += 2) {
            if (index > 0) json.append(',');
            json.append(quote(String.valueOf(keyValues[index])))
                .append(':')
                .append(value(keyValues[index + 1]));
        }
        return json.append('}').toString();
    }

    static String stringField(String json, String field) {
        var pattern = Pattern.compile("\\\"" + Pattern.quote(field) + "\\\"\\s*:\\s*\\\"((?:\\\\.|[^\\\"\\\\])*)\\\"");
        var matcher = pattern.matcher(json);
        if (!matcher.find()) {
            throw new AssertionError("Missing JSON string field '" + field + "' in response: " + json);
        }
        return unescape(matcher.group(1));
    }

    private static String value(Object value) {
        if (value == null) return "null";
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        return quote(String.valueOf(value));
    }

    private static String quote(String value) {
        return "\"" + value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t") + "\"";
    }

    private static String unescape(String value) {
        return value
            .replace("\\\"", "\"")
            .replace("\\n", "\n")
            .replace("\\r", "\r")
            .replace("\\t", "\t")
            .replace("\\\\", "\\");
    }
}
