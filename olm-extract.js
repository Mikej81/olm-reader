#!/usr/bin/env node

/**
 * OLM Extract CLI - Command line interface for extracting OLM archives
 * 
 * @author Mikej81
 * @license Apache-2.0
 */

const OLMReader = require('./lib/olm-reader');
const path = require('path');
const fs = require('fs');

class UnifiedOLMExtractor {
    constructor(outputDir, debugMode = false, allowOverwrite = true) {
        this.reader = new OLMReader(outputDir, debugMode, allowOverwrite);
        this.startTime = Date.now();
        this.setupCallbacks();
    }

    setupCallbacks() {
        // Set up callbacks to track progress
        this.reader.setCallback('email', (email, folderPath) => {
            if (this.reader.counters.emails % 1000 === 0) {
                console.log(`Processed ${this.reader.counters.emails} emails...`);
            }
        });

        this.reader.setCallback('contact', (contact) => {
            if (this.reader.counters.contacts % 100 === 0) {
                console.log(`Processed ${this.reader.counters.contacts} contacts...`);
            }
        });

        this.reader.setCallback('appointment', (appointment) => {
            if (this.reader.counters.appointments % 100 === 0) {
                console.log(`Processed ${this.reader.counters.appointments} appointments...`);
            }
        });

        this.reader.setCallback('task', (task) => {
            if (this.reader.counters.tasks % 100 === 0) {
                console.log(`Processed ${this.reader.counters.tasks} tasks...`);
            }
        });

        this.reader.setCallback('note', (note) => {
            if (this.reader.counters.notes % 100 === 0) {
                console.log(`Processed ${this.reader.counters.notes} notes...`);
            }
        });

        this.reader.setCallback('group', (group) => {
            if (this.reader.counters.groups % 10 === 0) {
                console.log(`Processed ${this.reader.counters.groups} groups...`);
            }
        });
    }

    async extract(olmFilePath, useStreamZip = false) {
        try {
            console.log(`Starting extraction of: ${olmFilePath}`);
            console.log(`Output directory: ${this.reader.outputDir}`);
            console.log(`File size: ${this.getFileSize(olmFilePath)}`);
            console.log('');

            // Check if multi-disk
            if (this.reader.isMultiDiskArchive && this.reader.isMultiDiskArchive(olmFilePath)) {
                console.log('Multi-disk archive detected - using advanced processing...');
            } else {
                console.log('Single archive detected - processing...');
            }

            // Start extraction
            await this.reader.readOLMFile(olmFilePath, useStreamZip);
            
            console.log('\nExtraction completed successfully!');
            this.printSummary();
            
        } catch (error) {
            console.error('\nError during extraction:', error.message);
            
            if (!useStreamZip && error.message.includes('multi-disk')) {
                console.log('\nRetrying with StreamZip fallback...');
                return this.extract(olmFilePath, true);
            }
            
            throw error;
        }
    }

    getFileSize(filePath) {
        try {
            const stats = fs.statSync(filePath);
            const sizeInBytes = stats.size;
            const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
            const sizeInGB = (sizeInBytes / (1024 * 1024 * 1024)).toFixed(2);
            
            if (sizeInBytes > 1024 * 1024 * 1024) {
                return `${sizeInGB} GB`;
            } else {
                return `${sizeInMB} MB`;
            }
        } catch (error) {
            return 'Unknown';
        }
    }

    printSummary() {
        const endTime = Date.now();
        const duration = Math.round((endTime - this.startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;

        console.log('\nExtraction Summary');
        console.log('==========================================');
        console.log(`Processing time: ${minutes}m ${seconds}s`);
        console.log('');
        console.log('Items extracted:');
        console.log(`  Emails:       ${this.reader.counters.emails.toLocaleString()}`);
        console.log(`  Contacts:     ${this.reader.counters.contacts.toLocaleString()}`);
        console.log(`  Appointments: ${this.reader.counters.appointments.toLocaleString()}`);
        console.log(`  Tasks:        ${this.reader.counters.tasks.toLocaleString()}`);
        console.log(`  Notes:        ${this.reader.counters.notes.toLocaleString()}`);
        console.log(`  Groups:       ${this.reader.counters.groups.toLocaleString()}`);
        console.log('');
        console.log('Output folders:');
        console.log(`  ${path.join(this.reader.outputDir, 'emails')}     - Email files (.eml)`);
        console.log(`  ${path.join(this.reader.outputDir, 'contacts')}   - Contact files (.vcf)`);
        console.log(`  ${path.join(this.reader.outputDir, 'appointments')} - Calendar files (.ics)`);
        console.log(`  ${path.join(this.reader.outputDir, 'tasks')}      - Task files (.txt)`);
        console.log(`  ${path.join(this.reader.outputDir, 'notes')}      - Note files (.txt)`);
        console.log(`  ${path.join(this.reader.outputDir, 'groups')}     - Group files (.txt)`);
    }
}

// Command line usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 1 || args.includes('--help') || args.includes('-h')) {
        console.log('OLM Reader - Unified Extraction Tool');
        console.log('====================================');
        console.log('');
        console.log('Usage: node olm-extract.js <olm-file-path> [output-directory] [options]');
        console.log('');
        console.log('Arguments:');
        console.log('  olm-file-path     Path to the .olm file to extract');
        console.log('  output-directory  Directory to save extracted files (optional)');
        console.log('');
        console.log('Options:');
        console.log('  --stream         Force use of StreamZip (for problematic archives)');
        console.log('  --debug          Enable detailed debug logging');
        console.log('  --no-overwrite   Skip files that already exist (default: overwrite)');
        console.log('  --help, -h       Show this help message');
        console.log('');
        console.log('Examples:');
        console.log('  node olm-extract.js ./archive.olm');
        console.log('  node olm-extract.js ./archive.olm ./extracted_data');
        console.log('  node olm-extract.js ./archive.olm ./extracted_data --stream');
        console.log('');
        console.log('Features:');
        console.log('  - Handles single and multi-disk OLM archives');
        console.log('  - Organized folder structure by content type');
        console.log('  - Progress tracking for large files');
        console.log('  - Standard format conversion (EML, VCF, ICS)');
        console.log('  - Fallback mechanisms for problematic files');
        console.log('  - Minimal external dependencies');
        process.exit(0);
    }

    const olmFilePath = args[0];
    
    // Filter out flags to find the actual output directory argument
    const nonFlagArgs = args.filter(arg => !arg.startsWith('--'));
    const outputDir = nonFlagArgs[1] || path.join(process.cwd(), 'olm_extracted');
    
    const useStreamZip = args.includes('--stream');
    const debugMode = args.includes('--debug');
    const allowOverwrite = !args.includes('--no-overwrite');

    // Validate input file
    if (!fs.existsSync(olmFilePath)) {
        console.error(`Error: File not found: ${olmFilePath}`);
        process.exit(1);
    }

    if (!olmFilePath.toLowerCase().endsWith('.olm')) {
        console.warn('Warning: File does not have .olm extension');
    }

    console.log('OLM Reader - Unified Extraction Tool');
    console.log('=====================================');

    const extractor = new UnifiedOLMExtractor(outputDir, debugMode, allowOverwrite);
    extractor.extract(olmFilePath, useStreamZip)
        .then(() => {
            console.log('\nAll done!');
            process.exit(0);
        })
        .catch(error => {
            console.error(`\nExtraction failed: ${error.message}`);
            console.error('\nTroubleshooting tips:');
            console.error('  - Try with --stream flag for large/multi-disk archives');
            console.error('  - Ensure sufficient disk space in output directory');
            console.error('  - Check file permissions on input and output paths');
            process.exit(1);
        });
}

module.exports = UnifiedOLMExtractor;