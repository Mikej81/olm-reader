const AdmZip = require('adm-zip');
const StreamZip = require('node-stream-zip');
const MultiDiskConverter = require('./convert-multidisk');
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

/**
 * A comprehensive library for reading and extracting MS Outlook for Mac OLM archives.
 * 
 * Supports extracting emails, contacts, appointments, tasks, notes, and groups
 * from single-disk and multi-disk OLM archives with automatic format conversion
 * to standard formats (EML, VCF, ICS, TXT).
 * 
 * @class OLMReader
 */
class OLMReader {
    /**
     * Creates a new OLMReader instance.
     * 
     * @param {string|null} outputDir - Directory to save extracted files (optional)
     * @param {boolean} debugMode - Enable detailed debug logging (default: false)
     * @param {boolean} allowOverwrite - Allow overwriting existing files (default: true)
     */
    constructor(outputDir = null, debugMode = false, allowOverwrite = true) {
        this.callbacks = {};
        this.outputDir = outputDir;
        this.debugMode = debugMode;
        this.allowOverwrite = allowOverwrite;
        this.counters = {
            emails: 0,
            contacts: 0,
            appointments: 0,
            tasks: 0,
            notes: 0,
            groups: 0
        };
        
        this.debug(`OLMReader constructor - outputDir: ${outputDir}, allowOverwrite: ${allowOverwrite}`);
        
        if (this.outputDir) {
            this.debug(`Setting up output directory: ${this.outputDir}`);
            this.ensureOutputDirectory();
        } else {
            this.debug('No output directory specified');
        }
    }

    debug(message) {
        if (this.debugMode) {
            console.log(`DEBUG: ${message}`);
        }
    }

    isMultiDiskArchive(filePath) {
        try {
            const fileName = path.basename(filePath, '.olm');
            const dir = path.dirname(filePath);
            
            const multiDiskPattern = new RegExp(`^${fileName}\.z\\d{2}$`);
            const files = fs.readdirSync(dir);
            const multiDiskFiles = files.filter(file => multiDiskPattern.test(file));
            
            return multiDiskFiles.length > 0;
        } catch (err) {
            return false;
        }
    }

    setCallback(type, callback) {
        this.callbacks[type] = callback;
    }

    ensureOutputDirectory() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        // Create organized folder structure
        const folders = ['emails', 'contacts', 'appointments', 'tasks', 'notes', 'groups', 'categories'];
        folders.forEach(folder => {
            const folderPath = path.join(this.outputDir, folder);
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }
        });
    }

    writeToFile(filename, content, subfolder = '') {
        if (!this.outputDir) {
            this.debug('No output directory set, skipping file write');
            return;
        }
        
        const filePath = subfolder 
            ? path.join(this.outputDir, subfolder, filename)
            : path.join(this.outputDir, filename);
        
        this.debug(`writeToFile - Full path: ${filePath}`);
        
        // Check if file exists and overwrite is disabled
        if (!this.allowOverwrite && fs.existsSync(filePath)) {
            this.debug(`File exists and overwrite disabled, skipping: ${filePath}`);
            return;
        }
        
        try {
            // Ensure directory exists
            const dir = path.dirname(filePath);
            this.debug(`Ensuring directory exists: ${dir}`);
            
            if (!fs.existsSync(dir)) {
                this.debug(`Creating directory: ${dir}`);
                fs.mkdirSync(dir, { recursive: true });
            }
            
            const action = fs.existsSync(filePath) ? 'Overwriting' : 'Writing';
            this.debug(`${action} file: ${filePath} (${content.length} bytes)`);
            fs.writeFileSync(filePath, content, 'utf8');
            this.debug(`File written successfully: ${filePath}`);
            
        } catch (error) {
            console.error(`ERROR: Failed to write file ${filePath}:`, error);
        }
    }

    appendToFile(filename, content) {
        if (!this.outputDir) return;
        
        const filePath = path.join(this.outputDir, filename);
        fs.appendFileSync(filePath, content, 'utf8');
    }

    parseOLMDate(dateString) {
        const date = new Date(dateString);
        return date;
    }

    extractEmailFolderPath(fullPath) {
        if (!fullPath || typeof fullPath !== 'string') return '';
        
        // Remove filename and get directory path
        const dirPath = path.dirname(fullPath);
        
        // Split path and extract meaningful folder names
        const pathParts = dirPath.split('/').filter(part => part && part !== '.');
        
        // Common OLM folder mappings - try to identify standard Outlook folders
        const folderMappings = {
            'inbox': 'Inbox',
            'sent': 'Sent Items', 
            'sentitems': 'Sent Items',
            'sent items': 'Sent Items',
            'deleted': 'Deleted Items',
            'deleteditems': 'Deleted Items',
            'deleted items': 'Deleted Items',
            'trash': 'Deleted Items',
            'drafts': 'Drafts',
            'outbox': 'Outbox',
            'junk': 'Junk Email',
            'junkemail': 'Junk Email',
            'junk email': 'Junk Email',
            'spam': 'Junk Email',
            'notes': 'Notes',
            'calendar': 'Calendar',
            'contacts': 'Contacts',
            'tasks': 'Tasks'
        };
        
        // Look for meaningful folder names in the path
        let extractedFolders = [];
        
        for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            
            // Skip common OLM internal structure parts
            if (part.match(/^(com\.microsoft\.outlook|data|messages?|\.olm|Local Folders)$/i) ||
                part.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) || // UUIDs
                part.match(/^message_\d+$/i) || // message_12345 patterns
                part.match(/^[0-9]+$/) || // pure numbers
                part.length < 2) { // single character folders
                continue;
            }
            
            // Check if it's a standard folder name
            const lowerPart = part.toLowerCase();
            if (folderMappings[lowerPart]) {
                extractedFolders.push(folderMappings[lowerPart]);
            } else {
                // Keep custom folder names, but clean them up
                const cleanName = part.replace(/[_-]/g, ' ').trim();
                if (cleanName && cleanName !== 'undefined' && cleanName !== 'null') {
                    extractedFolders.push(cleanName);
                }
            }
        }
        
        // If no meaningful folders found, try a different approach
        if (extractedFolders.length === 0) {
            // Look for folder indicators in the full path
            const fullPathLower = fullPath.toLowerCase();
            if (fullPathLower.includes('inbox')) extractedFolders.push('Inbox');
            else if (fullPathLower.includes('sent')) extractedFolders.push('Sent Items');
            else if (fullPathLower.includes('deleted') || fullPathLower.includes('trash')) extractedFolders.push('Deleted Items');
            else if (fullPathLower.includes('draft')) extractedFolders.push('Drafts');
            else if (fullPathLower.includes('junk') || fullPathLower.includes('spam')) extractedFolders.push('Junk Email');
            else extractedFolders.push('Other'); // Fallback for unidentified emails
        }
        
        return extractedFolders.join('/');
    }

    async readOLMFile(filePath, useStreamZip = false) {
        if (this.isMultiDiskArchive(filePath)) {
            console.log('Multi-disk archive detected. Converting to single archive...');
            const converter = new MultiDiskConverter();
            const convertedPath = filePath.replace('.olm', '-converted.olm');
            
            try {
                await converter.convertMultiDiskOLM(filePath, convertedPath);
                filePath = convertedPath;
                console.log('Multi-disk archive converted successfully');
            } catch (error) {
                console.error('Multi-disk conversion failed:', error.message);
                console.log('Attempting to read with node-stream-zip...');
                return this.readOLMFileWithStreamZip(filePath);
            }
        }
        
        if (useStreamZip) {
            return this.readOLMFileWithStreamZip(filePath);
        }
        
        return new Promise((resolve, reject) => {
            try {
                const zip = new AdmZip(filePath);
                const zipEntries = zip.getEntries();
                
                zipEntries.forEach((entry) => {
                    if (!entry.isDirectory) {
                        this.processEntry(zip, entry);
                    }
                });
                
                resolve();
            } catch (err) {
                console.error('AdmZip failed, trying with node-stream-zip...');
                this.readOLMFileWithStreamZip(filePath)
                    .then(resolve)
                    .catch(reject);
            }
        });
    }

    async readOLMFileWithStreamZip(filePath) {
        return new Promise((resolve, reject) => {
            const zip = new StreamZip.async({ file: filePath });
            
            zip.entries().then(entries => {
                const processPromises = [];
                
                for (const entry of Object.values(entries)) {
                    if (!entry.isDirectory && entry.name.endsWith('.xml')) {
                        const promise = zip.entryData(entry.name).then(data => {
                            const fileName = path.basename(entry.name);
                            const xmlData = data.toString('utf8');
                            this.parseXMLData(fileName, xmlData, entry.name);
                        });
                        processPromises.push(promise);
                    }
                }
                
                return Promise.all(processPromises);
            }).then(() => {
                zip.close();
                resolve();
            }).catch(err => {
                zip.close();
                reject(err);
            });
        });
    }

    processEntry(zip, entry) {
        const fileName = path.basename(entry.entryName);
        
        if (fileName.endsWith('.xml')) {
            try {
                const xmlData = zip.readAsText(entry);
                this.parseXMLData(fileName, xmlData, entry.entryName);
            } catch (err) {
                console.error('Error reading entry:', err);
            }
        }
    }

    parseXMLData(fileName, xmlData, fullPath) {
        try {
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: '',
                allowBooleanAttributes: true,
                parseAttributeValue: true,
                trimValues: true
            });
            const data = parser.parse(xmlData);
            
            switch (fileName) {
                case 'Categories.xml':
                    this.handleCategories(data);
                    break;
                case 'Contacts.xml':
                    this.handleContacts(data);
                    break;
                case 'Calendar.xml':
                    this.handleAppointments(data);
                    break;
                case 'Tasks.xml':
                    this.handleTasks(data);
                    break;
                case 'Notes.xml':
                    this.handleNotes(data);
                    break;
                case 'Groups.xml':
                    this.handleGroups(data);
                    break;
                default:
                    // Handle individual message files
                    if (fileName.startsWith('message_') && fileName.endsWith('.xml')) {
                        this.handleMessageFile(data, fileName, fullPath);
                    } else {
                        this.handleEmails(data);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error parsing XML:', error);
        }
    }

    handleCategories(data) {
        // JSON output removed per user request
        if (this.callbacks.categories) {
            this.callbacks.categories(data);
        }
    }

    handleContacts(data) {
        if (data.contacts && data.contacts.contact) {
            const contacts = Array.isArray(data.contacts.contact) ? data.contacts.contact : [data.contacts.contact];
            contacts.forEach(contact => {
                if (this.outputDir) {
                    this.counters.contacts++;
                    const vcfContent = this.generateVCFContent(contact);
                    const vcfFileName = `contact_${String(this.counters.contacts).padStart(5, '0')}.vcf`;
                    this.writeToFile(vcfFileName, vcfContent, 'contacts');
                }
                if (this.callbacks.contact) {
                    this.callbacks.contact(contact);
                }
            });
        }
    }

    handleAppointments(data) {
        if (data.appointments && data.appointments.appointment) {
            const appointments = Array.isArray(data.appointments.appointment) ? data.appointments.appointment : [data.appointments.appointment];
            appointments.forEach(appointment => {
                if (this.outputDir) {
                    this.counters.appointments++;
                    const icsContent = this.generateICSContent(appointment);
                    const icsFileName = `appointment_${String(this.counters.appointments).padStart(5, '0')}.ics`;
                    this.writeToFile(icsFileName, icsContent, 'appointments');
                }
                if (this.callbacks.appointment) {
                    this.callbacks.appointment(appointment);
                }
            });
        }
    }

    handleTasks(data) {
        if (data.tasks && data.tasks.task) {
            const tasks = Array.isArray(data.tasks.task) ? data.tasks.task : [data.tasks.task];
            tasks.forEach(task => {
                if (this.outputDir) {
                    this.counters.tasks++;
                    const taskContent = this.generateTaskContent(task);
                    const taskFileName = `task_${String(this.counters.tasks).padStart(5, '0')}.txt`;
                    this.writeToFile(taskFileName, taskContent, 'tasks');
                }
                if (this.callbacks.task) {
                    this.callbacks.task(task);
                }
            });
        }
    }

    handleNotes(data) {
        if (data.notes && data.notes.note) {
            const notes = Array.isArray(data.notes.note) ? data.notes.note : [data.notes.note];
            notes.forEach(note => {
                if (this.outputDir) {
                    this.counters.notes++;
                    const noteContent = this.generateNoteContent(note);
                    const noteFileName = `note_${String(this.counters.notes).padStart(5, '0')}.txt`;
                    this.writeToFile(noteFileName, noteContent, 'notes');
                }
                if (this.callbacks.note) {
                    this.callbacks.note(note);
                }
            });
        }
    }

    handleGroups(data) {
        if (data.groups && data.groups.group) {
            const groups = Array.isArray(data.groups.group) ? data.groups.group : [data.groups.group];
            groups.forEach(group => {
                if (this.outputDir) {
                    this.counters.groups++;
                    const groupContent = this.generateGroupContent(group);
                    const groupFileName = `group_${String(this.counters.groups).padStart(5, '0')}.txt`;
                    this.writeToFile(groupFileName, groupContent, 'groups');
                }
                if (this.callbacks.group) {
                    this.callbacks.group(group);
                }
            });
        }
    }

    handleMessageFile(data, fileName, fullPath) {
        if (data.emails && data.emails.email) {
            const email = data.emails.email;
            
            if (this.outputDir) {
                this.counters.emails++;
                
                // Extract email data from OLM structure
                const subject = email.OPFMessageCopySubject ? email.OPFMessageCopySubject['#text'] || '' : 'No subject';
                const fromAddress = email.OPFMessageCopyFromAddresses && email.OPFMessageCopyFromAddresses.emailAddress 
                    ? email.OPFMessageCopyFromAddresses.emailAddress.OPFContactEmailAddressAddress || ''
                    : '';
                const fromName = email.OPFMessageCopyFromAddresses && email.OPFMessageCopyFromAddresses.emailAddress 
                    ? email.OPFMessageCopyFromAddresses.emailAddress.OPFContactEmailAddressName || ''
                    : '';
                const toAddress = email.OPFMessageCopyToAddresses && email.OPFMessageCopyToAddresses.emailAddress 
                    ? email.OPFMessageCopyToAddresses.emailAddress.OPFContactEmailAddressAddress || ''
                    : '';
                const toName = email.OPFMessageCopyToAddresses && email.OPFMessageCopyToAddresses.emailAddress 
                    ? email.OPFMessageCopyToAddresses.emailAddress.OPFContactEmailAddressName || ''
                    : '';
                const sentTime = email.OPFMessageCopySentTime ? email.OPFMessageCopySentTime['#text'] || '' : '';
                const receivedTime = email.OPFMessageCopyReceivedTime ? email.OPFMessageCopyReceivedTime['#text'] || '' : '';
                const messageId = email.OPFMessageCopyMessageID ? email.OPFMessageCopyMessageID['#text'] || '' : '';
                const htmlBody = email.OPFMessageCopyHTMLBody && email.OPFMessageCopyHTMLBody['#text'] 
                    ? String(email.OPFMessageCopyHTMLBody['#text']) || '' : '';
                const textBody = email.OPFMessageCopyBody && email.OPFMessageCopyBody['#text'] 
                    ? String(email.OPFMessageCopyBody['#text']) || '' : '';
                
                // Extract folder path from OLM structure first
                const folderPath = this.extractEmailFolderPath(fullPath);
                
                // Debug logging for first few emails to see folder extraction
                if (this.counters.emails <= 10) {
                    this.debug(`Email ${this.counters.emails}: fullPath="${fullPath}" -> folderPath="${folderPath}"`);
                }
                
                // For now, use simple EML generation to avoid async issues
                this.debug(`Processing email ${this.counters.emails} - ${fileName}`);
                
                try {
                    const fallbackEML = this.generateSimpleEML({
                        subject, fromAddress, fromName, toAddress, toName, 
                        sentTime, messageId, htmlBody, textBody
                    });
                    
                    const emlFileName = `${fileName.replace('.xml', '')}.eml`;
                    const emailSubfolder = folderPath ? path.join('emails', folderPath) : 'emails';
                    
                    this.debug(`Saving email to ${emailSubfolder}/${emlFileName}`);
                    this.writeToFile(emlFileName, fallbackEML, emailSubfolder);
                    this.debug(`Successfully saved email ${emlFileName}`);
                    
                } catch (error) {
                    console.error(`ERROR: Failed to process email ${fileName}:`, error);
                }
                
                // JSON output removed per user request
            }
            
            if (this.callbacks.email) {
                this.callbacks.email(email, fullPath);
            }
        }
    }

    async generateEMLContent(emailData) {
        const { subject, fromAddress, fromName, toAddress, toName, sentTime, messageId, htmlBody, textBody } = emailData;
        
        try {
            // Use nodemailer's built-in MIME generation without actually sending
            const nodemailer = require('nodemailer');
            
            // Clean addresses
            const cleanFromAddress = this.cleanEmailAddress(fromAddress);
            const cleanToAddress = this.cleanEmailAddress(toAddress);
            const cleanFromName = this.cleanDisplayName(fromName);
            const cleanToName = this.cleanDisplayName(toName);
            
            // Build from/to with proper formatting
            const fromFormatted = cleanFromName && cleanFromAddress ? 
                `"${cleanFromName}" <${cleanFromAddress}>` : 
                (cleanFromAddress || 'unknown@unknown.com');
                
            const toFormatted = cleanToName && cleanToAddress ? 
                `"${cleanToName}" <${cleanToAddress}>` : 
                (cleanToAddress || 'undisclosed-recipients:;');
            
            // Create mail object
            const mailOptions = {
                messageId: messageId && messageId.trim() ? messageId.trim() : undefined,
                date: sentTime ? new Date(sentTime) : new Date(),
                from: fromFormatted,
                to: toFormatted,
                subject: this.cleanSubject(subject),
            };
            
            // Add content based on what's available
            const hasHtml = htmlBody && typeof htmlBody === 'string' && htmlBody.trim();
            const hasText = textBody && typeof textBody === 'string' && textBody.trim();
            
            if (hasText) {
                mailOptions.text = this.extractCleanText(textBody, htmlBody);
            }
            
            if (hasHtml) {
                mailOptions.html = htmlBody;
            }
            
            if (!hasText && !hasHtml) {
                mailOptions.text = '[This message has no content]';
            }
            
            // Create a transporter that doesn't actually send (just builds MIME)
            const transporter = nodemailer.createTransport({
                streamTransport: true,
                newline: 'unix'
            });
            
            // Generate the MIME message
            return new Promise((resolve, reject) => {
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        reject(error);
                    } else {
                        // Get the raw MIME message
                        let rawMessage = '';
                        info.message.on('data', (chunk) => {
                            rawMessage += chunk;
                        });
                        info.message.on('end', () => {
                            // Convert LF to CRLF for proper EML format
                            const emlContent = rawMessage.replace(/\n/g, '\r\n');
                            resolve(emlContent);
                        });
                        info.message.on('error', reject);
                    }
                });
            });
            
        } catch (error) {
            console.error('Error generating EML with Nodemailer:', error);
            // Fallback to simple format
            return this.generateSimpleEML(emailData);
        }
    }

    generateSimpleEML(emailData) {
        const { subject, fromAddress, fromName, toAddress, toName, sentTime, messageId, htmlBody, textBody } = emailData;
        
        // Simple fallback EML generation
        let eml = '';
        eml += `Message-ID: <${messageId || Date.now() + '@olm-reader'}>\r\n`;
        eml += `Date: ${sentTime ? this.formatRFC2822Date(sentTime) : new Date().toUTCString()}\r\n`;
        eml += `From: ${this.cleanEmailAddress(fromAddress) || 'unknown@unknown.com'}\r\n`;
        eml += `To: ${this.cleanEmailAddress(toAddress) || 'undisclosed-recipients:;'}\r\n`;
        eml += `Subject: ${this.cleanSubject(subject)}\r\n`;
        eml += `Content-Type: text/plain; charset=utf-8\r\n`;
        eml += `\r\n`;
        
        // Use text or HTML stripped to text
        if (textBody && typeof textBody === 'string' && textBody.trim()) {
            eml += this.extractCleanText(textBody);
        } else if (htmlBody && typeof htmlBody === 'string' && htmlBody.trim()) {
            eml += this.stripHtml(htmlBody);
        } else {
            eml += '[This message has no content]';
        }
        
        return eml + '\r\n';
    }

    cleanEmailAddress(address) {
        if (!address || typeof address !== 'string') return '';
        
        // Handle Exchange DN format: /O=ORG/OU=GROUP/CN=RECIPIENTS/CN=NAME
        if (address.startsWith('/O=') || address.startsWith('/o=')) {
            // Extract the last CN= part which often contains the actual name/email
            const cnMatch = address.match(/cn=([^/]+)$/i);
            if (cnMatch) {
                const extracted = cnMatch[1].replace(/\s+/g, '.').toLowerCase();
                // If it looks like an email, use it, otherwise construct one
                if (extracted.includes('@')) {
                    return extracted;
                } else {
                    return `${extracted}@unknown.com`;
                }
            }
            return 'unknown@unknown.com';
        }
        
        // Clean up standard email addresses
        return address.trim().replace(/[<>'"]/g, '');
    }

    cleanDisplayName(name) {
        if (!name || typeof name !== 'string') return '';
        return name.trim().replace(/[<>"]/g, '').substring(0, 100); // Limit length
    }

    cleanSubject(subject) {
        if (!subject || typeof subject !== 'string') return '(No Subject)';
        return subject.trim().substring(0, 200); // Limit length
    }

    formatRFC2822Date(dateString) {
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                return new Date().toUTCString();
            }
            return date.toUTCString();
        } catch (e) {
            return new Date().toUTCString();
        }
    }

    encodeHeaderValue(value) {
        if (!value || typeof value !== 'string') return '';
        
        // Check if encoding is needed (non-ASCII characters)
        if (/[\u0080-\uFFFF]/.test(value)) {
            // RFC 2047 encoding for non-ASCII characters
            return `=?utf-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
        }
        
        return value;
    }

    quotedPrintableEncode(text) {
        if (!text || typeof text !== 'string') return '';
        
        return text
            .replace(/[\u0080-\uFFFF]/g, (match) => {
                // Encode non-ASCII characters
                const bytes = Buffer.from(match, 'utf-8');
                return Array.from(bytes).map(b => `=${b.toString(16).toUpperCase().padStart(2, '0')}`).join('');
            })
            .replace(/=/g, '=3D') // Escape existing = signs
            .replace(/\r\n/g, '\r\n') // Preserve line endings
            .replace(/(.{75})/g, '$1=\r\n'); // Wrap long lines
    }

    base64Encode(text) {
        if (!text || typeof text !== 'string') return '';
        
        // Convert to base64 and wrap at 76 characters
        const base64 = Buffer.from(text, 'utf-8').toString('base64');
        return base64.replace(/(.{76})/g, '$1\r\n');
    }

    extractCleanText(textBody, htmlBody = null) {
        // If we have both text and HTML, prefer text body if it's meaningful
        if (textBody && typeof textBody === 'string') {
            const cleaned = this.stripHtml(textBody);
            if (cleaned && cleaned.trim().length > 20) {
                return cleaned;
            }
        }
        
        // Fallback to HTML if text is poor or missing
        if (htmlBody && typeof htmlBody === 'string') {
            return this.stripHtml(htmlBody);
        }
        
        // Last resort
        return textBody ? this.stripHtml(textBody) : '[No text content]';
    }

    normalizeLineEndings(text) {
        if (!text || typeof text !== 'string') return '';
        // Replace any existing line endings with CRLF for proper EML format
        return String(text).replace(/\r\n|\r|\n/g, '\r\n');
    }

    stripHtml(html) {
        if (!html || typeof html !== 'string') return '';
        
        let text = String(html);
        
        // Remove CSS styles and scripts first
        text = text
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')     // Remove CSS style blocks
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')   // Remove JavaScript
            .replace(/<!--[\s\S]*?-->/g, '')                    // Remove HTML comments
            .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')       // Remove head section
            
        // Convert semantic HTML to text equivalents
        text = text
            .replace(/<br\s*\/?>/gi, '\n')                      // <br> to newlines
            .replace(/<\/p>/gi, '\n\n')                         // End paragraphs with double newlines
            .replace(/<p[^>]*>/gi, '\n')                        // Start paragraphs with newlines
            .replace(/<\/div>/gi, '\n')                         // End divs with newlines
            .replace(/<div[^>]*>/gi, '\n')                      // Start divs with newlines
            .replace(/<\/h[1-6]>/gi, '\n\n')                    // Headers with double newlines
            .replace(/<h[1-6][^>]*>/gi, '\n')                   // Header starts
            .replace(/<\/tr>/gi, '\n')                          // Table rows
            .replace(/<t[dh][^>]*>/gi, '\t')                    // Table cells with tabs
            .replace(/<\/li>/gi, '\n')                          // List items
            .replace(/<li[^>]*>/gi, '• ')                       // List bullets
            .replace(/<\/ul>/gi, '\n')                          // End lists with newlines
            .replace(/<\/ol>/gi, '\n')                          // End ordered lists
            .replace(/<hr[^>]*>/gi, '\n---\n')                  // Horizontal rules
            
        // Remove all remaining HTML tags
        text = text.replace(/<[^>]*>/g, '');
        
        // Decode HTML entities
        text = text
            .replace(/&nbsp;/g, ' ')                            // Non-breaking spaces
            .replace(/&amp;/g, '&')                             // Ampersands
            .replace(/&lt;/g, '<')                              // Less than
            .replace(/&gt;/g, '>')                              // Greater than
            .replace(/&quot;/g, '"')                            // Quotes
            .replace(/&#39;/g, "'")                             // Apostrophes
            .replace(/&#8230;/g, '...')                         // Ellipsis
            .replace(/&#8220;/g, '"')                           // Left double quote
            .replace(/&#8221;/g, '"')                           // Right double quote
            .replace(/&#8217;/g, "'")                           // Right single quote
            .replace(/&#(\d+);/g, (match, num) => {             // Numeric entities
                try {
                    return String.fromCharCode(parseInt(num, 10));
                } catch (e) {
                    return match;
                }
            });
        
        // Clean up whitespace and formatting
        text = text
            .replace(/\n\s*\n\s*\n+/g, '\n\n')                 // Collapse multiple blank lines
            .replace(/[ \t]+/g, ' ')                            // Collapse multiple spaces
            .replace(/^\s+|\s+$/gm, '')                         // Trim lines
            .trim();                                            // Trim overall
        
        return text;
    }

    generateVCFContent(contact) {
        let vcf = 'BEGIN:VCARD\r\n';
        vcf += 'VERSION:3.0\r\n';
        
        const firstName = contact.OPFContactCopyFirstName && contact.OPFContactCopyFirstName['#text'] ? contact.OPFContactCopyFirstName['#text'] : '';
        const lastName = contact.OPFContactCopyLastName && contact.OPFContactCopyLastName['#text'] ? contact.OPFContactCopyLastName['#text'] : '';
        const displayName = contact.OPFContactCopyDisplayName && contact.OPFContactCopyDisplayName['#text'] ? contact.OPFContactCopyDisplayName['#text'] : `${firstName} ${lastName}`.trim();
        const company = contact.OPFContactCopyBusinessCompany && contact.OPFContactCopyBusinessCompany['#text'] ? contact.OPFContactCopyBusinessCompany['#text'] : '';
        const title = contact.OPFContactCopyBusinessTitle && contact.OPFContactCopyBusinessTitle['#text'] ? contact.OPFContactCopyBusinessTitle['#text'] : '';
        
        if (displayName) vcf += `FN:${displayName}\r\n`;
        if (firstName || lastName) vcf += `N:${lastName};${firstName};;;\r\n`;
        if (company) vcf += `ORG:${company}\r\n`;
        if (title) vcf += `TITLE:${title}\r\n`;
        
        // Email addresses
        if (contact.OPFContactCopyDefaultEmailAddress && contact.OPFContactCopyDefaultEmailAddress.contactEmailAddress) {
            const email = contact.OPFContactCopyDefaultEmailAddress.contactEmailAddress.OPFContactEmailAddressAddress;
            if (email) vcf += `EMAIL:${email}\r\n`;
        }
        
        // Phone numbers
        if (contact.OPFContactCopyBusinessPhone && contact.OPFContactCopyBusinessPhone['#text']) {
            vcf += `TEL;TYPE=WORK:${contact.OPFContactCopyBusinessPhone['#text']}\r\n`;
        }
        if (contact.OPFContactCopyHomePhone && contact.OPFContactCopyHomePhone['#text']) {
            vcf += `TEL;TYPE=HOME:${contact.OPFContactCopyHomePhone['#text']}\r\n`;
        }
        if (contact.OPFContactCopyCellPhone && contact.OPFContactCopyCellPhone['#text']) {
            vcf += `TEL;TYPE=CELL:${contact.OPFContactCopyCellPhone['#text']}\r\n`;
        }
        
        // Address
        const businessStreet = contact.OPFContactCopyBusinessStreetAddress && contact.OPFContactCopyBusinessStreetAddress['#text'] ? contact.OPFContactCopyBusinessStreetAddress['#text'] : '';
        const businessCity = contact.OPFContactCopyBusinessCity && contact.OPFContactCopyBusinessCity['#text'] ? contact.OPFContactCopyBusinessCity['#text'] : '';
        const businessState = contact.OPFContactCopyBusinessState && contact.OPFContactCopyBusinessState['#text'] ? contact.OPFContactCopyBusinessState['#text'] : '';
        const businessZip = contact.OPFContactCopyBusinessZip && contact.OPFContactCopyBusinessZip['#text'] ? contact.OPFContactCopyBusinessZip['#text'] : '';
        const businessCountry = contact.OPFContactCopyBusinessCountry && contact.OPFContactCopyBusinessCountry['#text'] ? contact.OPFContactCopyBusinessCountry['#text'] : '';
        
        if (businessStreet || businessCity || businessState || businessZip || businessCountry) {
            vcf += `ADR;TYPE=WORK:;;${businessStreet};${businessCity};${businessState};${businessZip};${businessCountry}\r\n`;
        }
        
        // Birthday
        if (contact.OPFContactCopyBirthday && contact.OPFContactCopyBirthday['#text']) {
            const birthday = new Date(contact.OPFContactCopyBirthday['#text']);
            vcf += `BDAY:${birthday.getFullYear()}-${String(birthday.getMonth() + 1).padStart(2, '0')}-${String(birthday.getDate()).padStart(2, '0')}\r\n`;
        }
        
        // Notes
        if (contact.OPFContactCopyNotesPlain && contact.OPFContactCopyNotesPlain['#text']) {
            vcf += `NOTE:${contact.OPFContactCopyNotesPlain['#text'].replace(/\n/g, '\\n')}\r\n`;
        }
        
        vcf += 'END:VCARD\r\n';
        return vcf;
    }

    generateICSContent(appointment) {
        let ics = 'BEGIN:VCALENDAR\r\n';
        ics += 'VERSION:2.0\r\n';
        ics += 'PRODID:-//OLMReader//EN\r\n';
        ics += 'BEGIN:VEVENT\r\n';
        
        const summary = appointment.OPFCalendarEventCopySummary && appointment.OPFCalendarEventCopySummary['#text'] ? 
            String(appointment.OPFCalendarEventCopySummary['#text']) : 'No Title';
        const description = appointment.OPFCalendarEventCopyDescriptionPlain && appointment.OPFCalendarEventCopyDescriptionPlain['#text'] ? 
            String(appointment.OPFCalendarEventCopyDescriptionPlain['#text']) : '';
        const location = appointment.OPFCalendarEventCopyLocation && appointment.OPFCalendarEventCopyLocation['#text'] ? 
            String(appointment.OPFCalendarEventCopyLocation['#text']) : '';
        const uuid = appointment.OPFCalendarEventCopyUUID && appointment.OPFCalendarEventCopyUUID['#text'] ? 
            String(appointment.OPFCalendarEventCopyUUID['#text']) : `${Date.now()}-${Math.random()}`;
        
        ics += `UID:${uuid}\r\n`;
        ics += `SUMMARY:${summary}\r\n`;
        
        if (description && typeof description === 'string') ics += `DESCRIPTION:${description.replace(/\n/g, '\\n')}\r\n`;
        if (location && typeof location === 'string') ics += `LOCATION:${location}\r\n`;
        
        if (appointment.OPFCalendarEventCopyStartTime && appointment.OPFCalendarEventCopyStartTime['#text']) {
            const startTime = new Date(appointment.OPFCalendarEventCopyStartTime['#text']);
            ics += `DTSTART:${this.formatICSDate(startTime)}\r\n`;
        }
        
        if (appointment.OPFCalendarEventCopyEndTime && appointment.OPFCalendarEventCopyEndTime['#text']) {
            const endTime = new Date(appointment.OPFCalendarEventCopyEndTime['#text']);
            ics += `DTEND:${this.formatICSDate(endTime)}\r\n`;
        }
        
        if (appointment.OPFCalendarEventCopyModDate && appointment.OPFCalendarEventCopyModDate['#text']) {
            const modDate = new Date(appointment.OPFCalendarEventCopyModDate['#text']);
            ics += `DTSTAMP:${this.formatICSDate(modDate)}\r\n`;
        }
        
        ics += 'END:VEVENT\r\n';
        ics += 'END:VCALENDAR\r\n';
        return ics;
    }

    formatICSDate(date) {
        return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    }

    generateTaskContent(task) {
        let content = '';
        
        const name = task.OPFTaskCopyName && task.OPFTaskCopyName['#text'] ? task.OPFTaskCopyName['#text'] : 'Untitled Task';
        const note = task.OPFTaskCopyNotePlain && task.OPFTaskCopyNotePlain['#text'] ? task.OPFTaskCopyNotePlain['#text'] : '';
        const priority = task.OPFTaskGetPriority && task.OPFTaskGetPriority['#text'] ? task.OPFTaskGetPriority['#text'] : '';
        const dueDate = task.OPFTaskCopyDueDateTime && task.OPFTaskCopyDueDateTime['#text'] ? new Date(task.OPFTaskCopyDueDateTime['#text']).toLocaleString() : '';
        const completed = task.OPFTaskCopyCompletedDateTime && task.OPFTaskCopyCompletedDateTime['#text'] ? new Date(task.OPFTaskCopyCompletedDateTime['#text']).toLocaleString() : '';
        
        content += `Task: ${name}\n`;
        if (priority) content += `Priority: ${priority}\n`;
        if (dueDate) content += `Due Date: ${dueDate}\n`;
        if (completed) content += `Completed: ${completed}\n`;
        content += '\n';
        if (note) content += `Notes:\n${note}\n`;
        
        return this.normalizeLineEndings(content);
    }

    generateNoteContent(note) {
        let content = '';
        
        const title = note.OPFNoteCopyTitle && note.OPFNoteCopyTitle['#text'] ? note.OPFNoteCopyTitle['#text'] : 'Untitled Note';
        const text = note.OPFNoteCopyText && note.OPFNoteCopyText['#text'] ? note.OPFNoteCopyText['#text'] : '';
        const created = note.OPFNoteCopyCreationDate && note.OPFNoteCopyCreationDate['#text'] ? new Date(note.OPFNoteCopyCreationDate['#text']).toLocaleString() : '';
        const modified = note.OPFNoteCopyModDate && note.OPFNoteCopyModDate['#text'] ? new Date(note.OPFNoteCopyModDate['#text']).toLocaleString() : '';
        
        content += `Title: ${title}\n`;
        if (created) content += `Created: ${created}\n`;
        if (modified) content += `Modified: ${modified}\n`;
        content += '\n';
        if (text) {
            // Strip HTML if present
            const cleanText = this.stripHtml(text);
            content += `${cleanText}\n`;
        }
        
        return this.normalizeLineEndings(content);
    }

    generateGroupContent(group) {
        let content = '';
        
        const displayName = group.OPFGroupCopyDisplayName && group.OPFGroupCopyDisplayName['#text'] ? group.OPFGroupCopyDisplayName['#text'] : 'Untitled Group';
        const modDate = group.OPFGroupCopyModDate && group.OPFGroupCopyModDate['#text'] ? new Date(group.OPFGroupCopyModDate['#text']).toLocaleString() : '';
        
        content += `Group: ${displayName}\n`;
        if (modDate) content += `Modified: ${modDate}\n`;
        content += '\n';
        
        if (group.OPFGroupCopyMemberList && group.OPFGroupCopyMemberList.emailAddress) {
            content += 'Members:\n';
            const members = Array.isArray(group.OPFGroupCopyMemberList.emailAddress) ? group.OPFGroupCopyMemberList.emailAddress : [group.OPFGroupCopyMemberList.emailAddress];
            members.forEach(member => {
                const name = member.OPFContactEmailAddressName || '';
                const email = member.OPFContactEmailAddressAddress || '';
                if (name && email) {
                    content += `  ${name} <${email}>\n`;
                } else if (email) {
                    content += `  ${email}\n`;
                }
            });
        }
        
        return this.normalizeLineEndings(content);
    }

    handleEmails(data) {
        if (data.emails && data.emails.email) {
            const emails = Array.isArray(data.emails.email) ? data.emails.email : [data.emails.email];
            emails.forEach(email => {
                if (this.outputDir) {
                    this.counters.emails++;
                    // JSON output removed per user request
                }
                if (this.callbacks.email) {
                    this.callbacks.email(email, null);
                }
            });
        }
    }
}


module.exports = OLMReader;