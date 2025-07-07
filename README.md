# OLMReader Node.js

A comprehensive Node.js library for reading and extracting MS Outlook for Mac OLM archives.

## Features

- **Complete OLM Support**: Extract emails, contacts, appointments, tasks, notes, and groups
- **Organized Output**: Automatic folder organization by content type
- **Multi-disk Archives**: Handles large multi-disk OLM files seamlessly
- **Fallback Mechanisms**: Multiple extraction methods for problematic archives
- **Progress Tracking**: Real-time progress feedback for large files
- **Standard Formats**: Converts to EML, VCF, ICS, and TXT formats
- **Minimal Dependencies**: Optimized for performance and reliability

## Installation

### Install from npm

```bash
npm install olm-reader
```

### Install globally for CLI usage

```bash
npm install -g olm-reader
```

### Clone and install from source

```bash
git clone https://github.com/Mikej81/olm-reader.git
cd olm-reader
npm install
```

## Quick Start

### Command Line Usage

**Basic extraction:**

```bash
# If installed globally
olm-extract archive.olm

# If installed locally
npx olm-extract archive.olm

# Or using node directly
node olm-extract.js archive.olm
```

**Custom output directory:**

```bash
olm-extract archive.olm ./my_extracted_data
```

**Large/problematic files:**

```bash
olm-extract archive.olm ./output --stream
```

**Help:**

```bash
olm-extract --help
```

### Programmatic Usage

```javascript
const OLMReader = require('olm-reader');

// Create reader with output directory
const reader = new OLMReader('./extracted_output');

// Set up callbacks for different data types
reader.setCallback('email', (email, fullPath) => {
    console.log(`Email: ${email.OPFMessageCopySubject?.['#text'] || 'No subject'}`);
});

reader.setCallback('contact', (contact) => {
    console.log(`Contact: ${contact.OPFContactCopyDisplayName?.['#text'] || 'Unknown'}`);
});

reader.setCallback('appointment', (appointment) => {
    console.log(`Appointment: ${appointment.OPFCalendarEventCopySummary?.['#text'] || 'No title'}`);
});

// Process the OLM file
reader.readOLMFile('path/to/archive.olm')
    .then(() => console.log('Extraction complete'))
    .catch(err => console.error('Error:', err));
```

## Output Structure

The extractor creates an organized folder structure:

```text
output_directory/
├── emails/           # Email messages (.eml files)
├── contacts/         # Contact information (.vcf files)
├── appointments/     # Calendar events (.ics files)
├── tasks/           # Task items (.txt files)
├── notes/           # Note entries (.txt files)
├── groups/          # Contact groups (.txt files)
└── categories/      # Category definitions (.json files)
```

## Supported File Types

### Input

- **Single OLM files** - Standard Outlook for Mac archives
- **Multi-disk OLM files** - Large archives split across multiple files (`.olm`, `.z01`, `.z02`, etc.)

### Output Formats

- **Emails**: `.eml` files (RFC 2822 compliant)
- **Contacts**: `.vcf` files (vCard 3.0 format)
- **Appointments**: `.ics` files (iCalendar format)
- **Tasks**: `.txt` files (human-readable format)
- **Notes**: `.txt` files (plain text with metadata)
- **Groups**: `.txt` files (contact group listings)

## Complete Example

Here's a comprehensive example showing how to use the library:

```javascript
const OLMReader = require('olm-reader');
const path = require('path');

async function processOLMFile(olmPath, outputPath) {
    console.log(`Processing OLM file: ${olmPath}`);
    
    // Create reader instance
    const reader = new OLMReader(outputPath, false, true);
    
    // Set up callbacks for different data types
    reader.setCallback('email', (email, fullPath) => {
        const subject = email.OPFMessageCopySubject?.['#text'] || 'No subject';
        const from = email.OPFMessageCopyFromAddresses?.['#text'] || 'Unknown sender';
        console.log(`Email: ${subject} (from: ${from})`);
    });
    
    reader.setCallback('contact', (contact) => {
        const name = contact.OPFContactCopyDisplayName?.['#text'] || 'Unknown';
        const email = contact.OPFContactCopyEmailAddresses?.['#text'] || 'No email';
        console.log(`Contact: ${name} (${email})`);
    });
    
    reader.setCallback('appointment', (appointment) => {
        const title = appointment.OPFCalendarEventCopySummary?.['#text'] || 'No title';
        const start = appointment.OPFCalendarEventCopyStartDate?.['#text'] || 'No date';
        console.log(`Appointment: ${title} (${start})`);
    });
    
    reader.setCallback('task', (task) => {
        const title = task.OPFTaskCopySubject?.['#text'] || 'No title';
        console.log(`Task: ${title}`);
    });
    
    reader.setCallback('note', (note) => {
        const title = note.OPFNoteCopySubject?.['#text'] || 'No title';
        console.log(`Note: ${title}`);
    });
    
    reader.setCallback('group', (group) => {
        const name = group.OPFGroupCopyName?.['#text'] || 'Unknown group';
        console.log(`Group: ${name}`);
    });
    
    try {
        // Process the file
        await reader.readOLMFile(olmPath);
        
        // Show summary
        console.log('\nProcessing Summary:');
        console.log(`  Emails: ${reader.counters.emails}`);
        console.log(`  Contacts: ${reader.counters.contacts}`);
        console.log(`  Appointments: ${reader.counters.appointments}`);
        console.log(`  Tasks: ${reader.counters.tasks}`);
        console.log(`  Notes: ${reader.counters.notes}`);
        console.log(`  Groups: ${reader.counters.groups}`);
        
        console.log(`\nExtraction complete! Check: ${outputPath}`);
        
    } catch (error) {
        if (error.message.includes('multi-disk')) {
            console.log('Retrying with StreamZip for multi-disk archive...');
            await reader.readOLMFile(olmPath, true);
        } else {
            console.error('Error processing OLM file:', error.message);
            throw error;
        }
    }
}

// Usage
const olmFile = '/path/to/your/archive.olm';
const outputDir = './extracted_data';

processOLMFile(olmFile, outputDir)
    .then(() => console.log('Processing finished'))
    .catch(err => console.error('Failed:', err));
```

## Advanced Usage

### Handling Large Files

For files over 1GB or multi-disk archives:

```javascript
// Force StreamZip for better memory handling
await reader.readOLMFile('large-archive.olm', true);
```

### Custom Callbacks

```javascript
reader.setCallback('email', (email, fullPath) => {
    // Extract custom fields
    const messageId = email.OPFMessageCopyMessageID?.['#text'];
    const sentTime = email.OPFMessageCopySentTime?.['#text'];
    
    // Custom processing logic
    processEmail(email, messageId, sentTime);
});
```

### Error Handling

```javascript
try {
    await reader.readOLMFile('archive.olm');
} catch (error) {
    if (error.message.includes('multi-disk')) {
        // Retry with StreamZip
        await reader.readOLMFile('archive.olm', true);
    } else {
        console.error('Extraction failed:', error);
    }
}
```

## API Reference

### OLMReader

#### Constructor

```javascript
new OLMReader(outputDir)
```

- `outputDir` (string, optional): Directory to save extracted files

#### Methods

##### `setCallback(type, callback)`

Set a callback function for a specific data type.

**Types:**

- `'email'` - Email messages
- `'contact'` - Contact entries  
- `'appointment'` - Calendar appointments
- `'task'` - Task items
- `'note'` - Note entries
- `'group'` - Contact groups
- `'categories'` - Categories

##### `readOLMFile(filePath, useStreamZip)`

Read and process an OLM file.

**Parameters:**

- `filePath` (string): Path to the OLM file
- `useStreamZip` (boolean, optional): Force use of StreamZip for large files

**Returns:** Promise that resolves when processing is complete.

##### `parseOLMDate(dateString)`

Parse OLM date format into JavaScript Date object.

## Troubleshooting

### Common Issues

#### "multi-disk zip files are not supported"

```bash
node olm-extract.js archive.olm ./output --stream
```

#### Out of memory errors

- Use the `--stream` flag
- Ensure sufficient disk space (2-3x the OLM file size)
- Close other applications to free RAM

#### Permission errors

```bash
# Ensure write permissions
chmod 755 ./output_directory
```

#### Large file processing

- Multi-disk archives are automatically detected and handled
- Progress is displayed every 1000 emails processed
- Use SSD storage for better performance

### Performance Tips

- **SSD storage**: Use SSD for both input and output for faster processing
- **Memory**: 8GB+ RAM recommended for files over 10GB
- **Disk space**: Ensure 2-3x the OLM file size available
- **Streaming**: Use `--stream` flag for files over 5GB

## Testing

This package includes a comprehensive test suite covering all major functionality.

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode (for development)
npm run test:watch
```

### Test Coverage

The test suite includes:

- **Unit tests** for all core OLMReader functionality
- **Integration tests** for CLI commands
- **Error handling** and edge case testing
- **Format validation** for EML, VCF, and ICS outputs
- **HTML processing** and text extraction testing

Current coverage: **52% statements, 40% branches**

### Test Structure

```text
test/
├── olm-reader.test.js    # Core library unit tests
├── cli.test.js           # CLI integration tests
└── mocha.opts            # Test configuration
```

## Dependencies

- **adm-zip**: ZIP file handling (primary method)
- **node-stream-zip**: Streaming ZIP handling (fallback)
- **fast-xml-parser**: XML parsing for OLM data
- **yauzl**: Additional ZIP support for edge cases

### Development Dependencies

- **mocha**: Test framework
- **chai**: Assertion library
- **sinon**: Test spies and mocks
- **nyc**: Code coverage reporting
- **tmp**: Temporary file/directory creation for tests
