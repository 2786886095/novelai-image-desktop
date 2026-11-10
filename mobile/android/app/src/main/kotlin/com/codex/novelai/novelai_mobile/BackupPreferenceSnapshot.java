package com.codex.novelai.novelai_mobile;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import javax.xml.parsers.SAXParserFactory;
import org.xml.sax.*;
import org.xml.sax.helpers.DefaultHandler;

/** Read-only export snapshot. A large XML text node is never built in memory. */
public final class BackupPreferenceSnapshot extends DefaultHandler {
    private static final int MAX_VALUE = 16 * 1024 * 1024;
    private static final int MAX_KEYS = 4096;
    private static final long MAX_SOURCE = 1024L * 1024 * 1024;
    private final File stage;
    private final Writer index;
    private final HashSet<String> keys = new HashSet<>();
    private int depth, number, characters;
    private long writtenCharacters;
    private String key, type, scalar;
    private Writer value;
    private File file;
    private boolean oversized, rootSeen;

    private BackupPreferenceSnapshot(File stage, Writer index) {
        this.stage = stage;
        this.index = index;
    }

    /** Android treats a journal .bak as authoritative if present. Do not rename either file. */
    private static File source(File root) {
        File journal = new File(root, "FlutterSharedPreferences.xml.bak");
        return journal.exists() ? journal : new File(root, "FlutterSharedPreferences.xml");
    }

    public static void write(File root, File stage) throws Exception {
        File selected = source(root);
        long bytes = selected.length(), modified = selected.lastModified();
        if (!selected.isFile() || bytes <= 0 || bytes > MAX_SOURCE)
            throw new IOException("Legacy preferences source unavailable or too large");
        XMLReader reader = SAXParserFactory.newInstance().newSAXParser().getXMLReader();
        // SharedPreferences XML never needs declarations beyond <?xml ...?>.
        // The input guard rejects all <! constructs before the parser sees
        // them, including DTDs/XXE, even across a read-buffer boundary.
        reader.setEntityResolver((publicId, systemId) -> {
            throw new SAXException("Unexpected external entity");
        });
        try (InputStream input = new GuardedInput(
                 new BufferedInputStream(new FileInputStream(selected), 65536));
             Writer index = writer(new File(stage, "index.tsv"))) {
            BackupPreferenceSnapshot handler = new BackupPreferenceSnapshot(stage, index);
            reader.setContentHandler(handler);
            reader.setErrorHandler(handler);
            try {
                reader.parse(new InputSource(input));
                if (!handler.rootSeen || handler.depth != 0 || handler.keys.isEmpty())
                    throw new IOException("Empty or incomplete legacy preferences");
            } finally {
                if (handler.value != null) handler.value.close();
            }
        }
        if (!source(root).equals(selected) || selected.length() != bytes
            || selected.lastModified() != modified) {
            throw new IOException("Legacy preferences changed while reading");
        }
    }

    private static Writer writer(File output) throws IOException {
        return new BufferedWriter(new OutputStreamWriter(
            new FileOutputStream(output), StandardCharsets.UTF_8), 8192);
    }

    @Override public void startElement(String uri, String local, String tag, Attributes attrs)
            throws SAXException {
        depth++;
        if (depth == 1) {
            if (!"map".equals(tag) || rootSeen) throw new SAXException("Invalid map");
            rootSeen = true;
            return;
        }
        if (depth != 2) {
            if ("unsupported".equals(type)) return;
            throw new SAXException("Unexpected nesting in preferences");
        }
        key = attrs.getValue("name");
        if (key == null || !key.startsWith("flutter.")) {
            key = null;
            type = "unsupported";
            return;
        }
        key = key.substring("flutter.".length());
        if (key.isEmpty() || key.length() > 256 || key.indexOf('\t') >= 0
            || key.indexOf('\n') >= 0 || key.indexOf('\r') >= 0
            || keys.size() >= MAX_KEYS || !keys.add(key)) {
            throw new SAXException("Invalid or duplicate preference key");
        }
        type = tag;
        characters = 0;
        oversized = false;
        scalar = attrs.getValue("value");
        if ("string".equals(type)) {
            file = new File(stage, "value-" + number);
            try { value = writer(file); }
            catch (IOException e) { throw new SAXException(e); }
        } else if (!("int".equals(type) || "long".equals(type)
            || "float".equals(type) || "boolean".equals(type))) {
            type = "unsupported";
        }
    }

    @Override public void characters(char[] text, int off, int size) throws SAXException {
        if (depth != 2 || value == null) return;
        try {
            characters += size;
            if (characters > MAX_VALUE) {
                value.close();
                value = null;
                if (!file.delete()) throw new IOException("Cannot discard oversized temporary value");
                oversized = true;
                return;
            }
            writtenCharacters += size;
            if (writtenCharacters > 256L * 1024 * 1024)
                throw new IOException("Legacy preference snapshot exceeds temporary data limit");
            value.write(text, off, size);
        } catch (IOException e) { throw new SAXException(e); }
    }

    @Override public void endElement(String uri, String local, String tag) throws SAXException {
        if (depth-- != 2 || key == null) return;
        try {
            if (value != null) {
                value.close();
                value = null;
                if (file.length() > MAX_VALUE) {
                    if (!file.delete()) throw new IOException("Cannot discard oversized temporary value");
                    oversized = true;
                }
            }
            String payload = "";
            if (oversized) type = "oversized";
            else if ("string".equals(type)) payload = "value-" + number;
            else if (!"unsupported".equals(type)) {
                if (scalar == null || !scalar.matches("[-A-Za-z0-9+.]{1,32}"))
                    throw new IOException("Invalid scalar");
                payload = scalar;
            }
            index.write(key + "\t" + type + "\t" + payload + "\n");
            number++;
        } catch (IOException e) { throw new SAXException(e); }
    }

    private static final class GuardedInput extends FilterInputStream {
        private int previous = -1;
        private long bytes;
        GuardedInput(InputStream in) { super(in); }
        private void accept(int b) throws IOException {
            if (++bytes > MAX_SOURCE || b == 0 || (previous == '<' && b == '!'))
                throw new IOException("Unexpected markup or non-UTF-8 preferences");
            previous = b;
        }
        @Override public int read() throws IOException {
            int b = super.read();
            if (b >= 0) accept(b);
            return b;
        }
        @Override public int read(byte[] b, int off, int len) throws IOException {
            int n = super.read(b, off, len);
            for (int i = off; i < off + n; i++) accept(b[i] & 255);
            return n;
        }
    }
}
