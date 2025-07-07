const OLMReader = require('./olm-reader-simple.js');
const path = require('path');

class SimpleOLMExtractor {
    constructor(outputDir) {
        this.reader = new OLMReader(outputDir);
        this.setupCallbacks();
    }

    setupCallbacks() {
        // Set up callbacks to handle different data types
        this.reader.setCallback('email', (email, folderPath) => {
            console.log(`Email in folder "${folderPath || 'root'}": ${email.subject || 'No subject'}`);
        });

        this.reader.setCallback('contact', (contact, folderPath) => {
            console.log(`Contact in folder "${folderPath || 'root'}": ${contact.name || 'Unknown name'}`);
        });

        this.reader.setCallback('appointment', (appointment, folderPath) => {
            console.log(`Appointment in folder "${folderPath || 'root'}": ${appointment.subject || 'No subject'}`);
        });

        this.reader.setCallback('task', (task, folderPath) => {
            console.log(`Task in folder "${folderPath || 'root'}": ${task.name || 'Untitled'}`);
        });

        this.reader.setCallback('note', (note, folderPath) => {
            console.log(`Note in folder "${folderPath || 'root'}": ${note.title || 'Untitled'}`);
        });

        this.reader.setCallback('group', (group, folderPath) => {
            console.log(`Group in folder "${folderPath || 'root'}": ${group.name || 'Unnamed'}`);
        });

        this.reader.setCallback('categories', (categories, folderPath) => {
            console.log(`Categories found in folder "${folderPath || 'root'}"`);
        });
    }

    async extract(olmFilePath) {
        try {
            console.log(`Starting extraction of: ${olmFilePath}`);
            console.log(`Output directory: ${this.reader.outputDir}`);
            console.log('Processing OLM file with folder structure preservation...');
            
            await this.reader.readOLMFile(olmFilePath);
            
            console.log('\nExtraction completed successfully!');
            console.log('Check the output directory for organized files and the summary report.');
            
        } catch (error) {
            console.error('Error during extraction:', error);
            throw error;
        }
    }
}

// Command line usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.log('Usage: node example-simple.js <olm-file-path> [output-directory]');
        console.log('');
        console.log('Examples:');
        console.log('  node example-simple.js ./myarchive.olm');
        console.log('  node example-simple.js ./myarchive.olm ./extracted_data');
        console.log('');
        console.log('Features:');
        console.log('  - Preserves original folder structure from OLM');
        console.log('  - Organizes extracted content by type (emails, contacts, etc.)');
        console.log('  - Generates extraction summary report');
        console.log('  - Minimal dependencies (only yauzl)');
        process.exit(1);
    }

    const olmFilePath = args[0];
    const outputDir = args[1] || path.join(process.cwd(), 'olm_extracted');

    console.log('OLM Reader - Simple Folder Structure Extractor');
    console.log('==============================================');

    const extractor = new SimpleOLMExtractor(outputDir);
    extractor.extract(olmFilePath)
        .then(() => {
            console.log('\nAll done!');
        })
        .catch(error => {
            console.error('\nExtraction failed:', error.message);
            process.exit(1);
        });
}

module.exports = SimpleOLMExtractor;