const yauzl = require('yauzl');
const fs = require('fs');
const path = require('path');

class OLMReader {
    constructor(outputDir = null) {
        this.callbacks = {};
        this.outputDir = outputDir;
        this.folderStructure = new Map();
        this.counters = {
            emails: 0,
            contacts: 0,
            appointments: 0,
            tasks: 0,
            notes: 0,
            groups: 0
        };
        
        if (this.outputDir) {
            this.ensureOutputDirectory();
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

    createFolderForPath(relativePath, type = 'emails') {
        if (!this.outputDir) return this.outputDir;
        
        // Extract folder path from the OLM internal structure
        const folderPath = path.dirname(relativePath);
        const fullPath = path.join(this.outputDir, type, folderPath);
        
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
        return fullPath;
    }

    writeToFile(filename, content, subfolder = '') {
        if (!this.outputDir) return;
        
        const filePath = subfolder 
            ? path.join(this.outputDir, subfolder, filename)
            : path.join(this.outputDir, filename);
        
        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, content, 'utf8');
    }

    parseOLMDate(dateString) {
        try {
            return new Date(dateString);
        } catch (e) {
            return new Date();
        }
    }

    async readOLMFile(filePath) {
        return new Promise((resolve, reject) => {
            yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
                if (err) {
                    reject(err);
                    return;
                }

                // First pass: map folder structure
                this.mapFolderStructure(zipfile).then(() => {
                    // Second pass: process entries
                    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile2) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        this.processAllEntries(zipfile2, resolve, reject);
                    });
                }).catch(reject);
            });
        });
    }

    async mapFolderStructure(zipfile) {
        return new Promise((resolve, reject) => {
            zipfile.readEntry();
            
            zipfile.on('entry', (entry) => {
                // Build folder hierarchy map
                const pathParts = entry.fileName.split('/');
                if (pathParts.length > 1) {
                    const folder = pathParts.slice(0, -1).join('/');
                    this.folderStructure.set(entry.fileName, folder);
                }
                zipfile.readEntry();
            });

            zipfile.on('end', () => {
                zipfile.close();
                resolve();
            });

            zipfile.on('error', reject);
        });
    }

    processAllEntries(zipfile, resolve, reject) {
        zipfile.readEntry();
        
        zipfile.on('entry', (entry) => {
            if (/\/$/.test(entry.fileName)) {
                // Directory entry
                if (this.outputDir) {
                    const dirPath = path.join(this.outputDir, 'structure', entry.fileName);
                    if (!fs.existsSync(dirPath)) {
                        fs.mkdirSync(dirPath, { recursive: true });
                    }
                }
                zipfile.readEntry();
            } else {
                // File entry
                this.processEntry(zipfile, entry);
            }
        });

        zipfile.on('end', () => {
            zipfile.close();
            this.generateSummary();
            resolve();
        });

        zipfile.on('error', (err) => {
            zipfile.close();
            reject(err);
        });
    }

    processEntry(zipfile, entry) {
        const fileName = path.basename(entry.fileName);
        const folderPath = this.folderStructure.get(entry.fileName) || '';
        
        if (fileName.endsWith('.xml')) {
            zipfile.openReadStream(entry, (err, readStream) => {
                if (err) {
                    console.error('Error opening stream:', err);
                    zipfile.readEntry();
                    return;
                }

                let xmlData = '';
                readStream.on('data', (chunk) => {
                    xmlData += chunk;
                });

                readStream.on('end', () => {
                    this.parseXMLData(fileName, xmlData, entry.fileName, folderPath);
                    zipfile.readEntry();
                });

                readStream.on('error', (err) => {
                    console.error('Error reading stream:', err);
                    zipfile.readEntry();
                });
            });
        } else {
            zipfile.readEntry();
        }
    }

    parseXMLData(fileName, xmlData, fullPath, folderPath) {
        try {
            const data = this.parseXML(xmlData);
            
            switch (fileName) {
                case 'Categories.xml':
                    this.handleCategories(data, folderPath);
                    break;
                case 'Contacts.xml':
                    this.handleContacts(data, folderPath);
                    break;
                case 'Calendar.xml':
                    this.handleAppointments(data, folderPath);
                    break;
                case 'Tasks.xml':
                    this.handleTasks(data, folderPath);
                    break;
                case 'Notes.xml':
                    this.handleNotes(data, folderPath);
                    break;
                case 'Groups.xml':
                    this.handleGroups(data, folderPath);
                    break;
                default:
                    this.handleEmails(data, fullPath, folderPath);
                    break;
            }
        } catch (error) {
            console.error('Error parsing XML:', error);
        }
    }

    parseXML(xmlString) {
        // Simple XML parser for minimal dependencies
        const result = {};
        
        // Extract root element
        const rootMatch = xmlString.match(/<(\w+)[^>]*>([\s\S]*)<\/\1>/);
        if (!rootMatch) return result;
        
        const rootTag = rootMatch[1];
        const content = rootMatch[2];
        
        // Parse child elements
        const elementRegex = /<(\w+)(?:\s[^>]*)?>([^<]*(?:<(?!\/?\1\b)[^<]*)*)<\/\1>/g;
        let match;
        
        result[rootTag] = {};
        while ((match = elementRegex.exec(content)) !== null) {
            const tag = match[1];
            const value = match[2].trim();
            
            if (result[rootTag][tag]) {
                if (Array.isArray(result[rootTag][tag])) {
                    result[rootTag][tag].push(value);
                } else {
                    result[rootTag][tag] = [result[rootTag][tag], value];
                }
            } else {
                result[rootTag][tag] = value;
            }
        }
        
        return result;
    }

    handleCategories(data, folderPath) {
        if (this.outputDir) {
            const content = JSON.stringify(data, null, 2);
            this.writeToFile('categories.json', content, 'categories');
        }
        
        if (this.callbacks.categories) {
            this.callbacks.categories(data, folderPath);
        }
    }

    handleContacts(data, folderPath) {
        if (data.contacts && data.contacts.contact) {
            const contacts = Array.isArray(data.contacts.contact) ? data.contacts.contact : [data.contacts.contact];
            contacts.forEach(contact => {
                if (this.outputDir) {
                    this.counters.contacts++;
                    const content = this.formatContact(contact);
                    const fileName = `contact_${String(this.counters.contacts).padStart(5, '0')}.txt`;
                    const subFolder = folderPath ? path.join('contacts', folderPath) : 'contacts';
                    this.writeToFile(fileName, content, subFolder);
                }
                
                if (this.callbacks.contact) {
                    this.callbacks.contact(contact, folderPath);
                }
            });
        }
    }

    handleAppointments(data, folderPath) {
        if (data.appointments && data.appointments.appointment) {
            const appointments = Array.isArray(data.appointments.appointment) ? data.appointments.appointment : [data.appointments.appointment];
            appointments.forEach(appointment => {
                if (this.outputDir) {
                    this.counters.appointments++;
                    const content = this.formatAppointment(appointment);
                    const fileName = `appointment_${String(this.counters.appointments).padStart(5, '0')}.txt`;
                    const subFolder = folderPath ? path.join('appointments', folderPath) : 'appointments';
                    this.writeToFile(fileName, content, subFolder);
                }
                
                if (this.callbacks.appointment) {
                    this.callbacks.appointment(appointment, folderPath);
                }
            });
        }
    }

    handleTasks(data, folderPath) {
        if (data.tasks && data.tasks.task) {
            const tasks = Array.isArray(data.tasks.task) ? data.tasks.task : [data.tasks.task];
            tasks.forEach(task => {
                if (this.outputDir) {
                    this.counters.tasks++;
                    const content = this.formatTask(task);
                    const fileName = `task_${String(this.counters.tasks).padStart(5, '0')}.txt`;
                    const subFolder = folderPath ? path.join('tasks', folderPath) : 'tasks';
                    this.writeToFile(fileName, content, subFolder);
                }
                
                if (this.callbacks.task) {
                    this.callbacks.task(task, folderPath);
                }
            });
        }
    }

    handleNotes(data, folderPath) {
        if (data.notes && data.notes.note) {
            const notes = Array.isArray(data.notes.note) ? data.notes.note : [data.notes.note];
            notes.forEach(note => {
                if (this.outputDir) {
                    this.counters.notes++;
                    const content = this.formatNote(note);
                    const fileName = `note_${String(this.counters.notes).padStart(5, '0')}.txt`;
                    const subFolder = folderPath ? path.join('notes', folderPath) : 'notes';
                    this.writeToFile(fileName, content, subFolder);
                }
                
                if (this.callbacks.note) {
                    this.callbacks.note(note, folderPath);
                }
            });
        }
    }

    handleGroups(data, folderPath) {
        if (data.groups && data.groups.group) {
            const groups = Array.isArray(data.groups.group) ? data.groups.group : [data.groups.group];
            groups.forEach(group => {
                if (this.outputDir) {
                    this.counters.groups++;
                    const content = this.formatGroup(group);
                    const fileName = `group_${String(this.counters.groups).padStart(5, '0')}.txt`;
                    const subFolder = folderPath ? path.join('groups', folderPath) : 'groups';
                    this.writeToFile(fileName, content, subFolder);
                }
                
                if (this.callbacks.group) {
                    this.callbacks.group(group, folderPath);
                }
            });
        }
    }

    handleEmails(data, fullPath, folderPath) {
        if (data.emails && data.emails.email) {
            const emails = Array.isArray(data.emails.email) ? data.emails.email : [data.emails.email];
            emails.forEach(email => {
                if (this.outputDir) {
                    this.counters.emails++;
                    const content = this.formatEmail(email);
                    const fileName = `email_${String(this.counters.emails).padStart(5, '0')}.txt`;
                    const subFolder = folderPath ? path.join('emails', folderPath) : 'emails';
                    this.writeToFile(fileName, content, subFolder);
                }
                
                if (this.callbacks.email) {
                    this.callbacks.email(email, folderPath);
                }
            });
        }
    }

    formatContact(contact) {
        return `Contact Information:
Name: ${contact.name || 'Unknown'}
Email: ${contact.email || 'Unknown'}
Phone: ${contact.phone || 'Unknown'}
Company: ${contact.company || 'Unknown'}

Raw Data:
${JSON.stringify(contact, null, 2)}
`;
    }

    formatAppointment(appointment) {
        return `Appointment Details:
Subject: ${appointment.subject || 'No Subject'}
Start: ${appointment.start || 'Unknown'}
End: ${appointment.end || 'Unknown'}
Location: ${appointment.location || 'Unknown'}

Raw Data:
${JSON.stringify(appointment, null, 2)}
`;
    }

    formatTask(task) {
        return `Task Information:
Name: ${task.name || 'Untitled'}
Due Date: ${task.dueDate || 'Not set'}
Priority: ${task.priority || 'Normal'}
Status: ${task.status || 'Unknown'}

Raw Data:
${JSON.stringify(task, null, 2)}
`;
    }

    formatNote(note) {
        return `Note:
Title: ${note.title || 'Untitled'}
Created: ${note.created || 'Unknown'}
Content: ${note.content || 'Empty'}

Raw Data:
${JSON.stringify(note, null, 2)}
`;
    }

    formatGroup(group) {
        return `Group Information:
Name: ${group.name || 'Unnamed Group'}
Members: ${group.members || 'No members listed'}

Raw Data:
${JSON.stringify(group, null, 2)}
`;
    }

    formatEmail(email) {
        return `Email:
Subject: ${email.subject || 'No Subject'}
From: ${email.from || 'Unknown Sender'}
To: ${email.to || 'Unknown Recipient'}
Date: ${email.date || 'Unknown Date'}
Body: ${email.body || 'No content'}

Raw Data:
${JSON.stringify(email, null, 2)}
`;
    }

    generateSummary() {
        if (!this.outputDir) return;
        
        const summary = `OLM Extraction Summary
======================

Extraction completed at: ${new Date().toLocaleString()}

Item Counts:
- Emails: ${this.counters.emails}
- Contacts: ${this.counters.contacts}
- Appointments: ${this.counters.appointments}
- Tasks: ${this.counters.tasks}
- Notes: ${this.counters.notes}
- Groups: ${this.counters.groups}

Folder Structure:
${Array.from(this.folderStructure.values())
    .filter((value, index, self) => self.indexOf(value) === index)
    .sort()
    .map(folder => `- ${folder}`)
    .join('\n')}

Files are organized in the following structure:
- emails/     - Email messages organized by original folder structure
- contacts/   - Contact information
- appointments/ - Calendar appointments
- tasks/      - Task items
- notes/      - Note entries
- groups/     - Contact groups
- categories/ - Category definitions
- structure/  - Original OLM folder hierarchy
`;
        
        this.writeToFile('EXTRACTION_SUMMARY.txt', summary);
        console.log('Extraction completed. Summary written to EXTRACTION_SUMMARY.txt');
    }
}

module.exports = OLMReader;