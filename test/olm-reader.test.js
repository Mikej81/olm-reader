const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const tmp = require('tmp');
const OLMReader = require('../index');

describe('OLMReader', () => {
    let tmpDir;
    let reader;

    beforeEach(() => {
        // Create temporary directory for tests
        tmpDir = tmp.dirSync({ unsafeCleanup: true });
        reader = new OLMReader(tmpDir.name, false, true);
    });

    afterEach(() => {
        // Clean up temporary directory
        if (tmpDir) {
            tmpDir.removeCallback();
        }
    });

    describe('Constructor', () => {
        it('should create an instance with default parameters', () => {
            const defaultReader = new OLMReader();
            expect(defaultReader).to.be.instanceOf(OLMReader);
            expect(defaultReader.outputDir).to.be.null;
            expect(defaultReader.debugMode).to.be.false;
            expect(defaultReader.allowOverwrite).to.be.true;
        });

        it('should create an instance with custom parameters', () => {
            const customTmpDir = tmp.dirSync({ unsafeCleanup: true });
            const customReader = new OLMReader(customTmpDir.name, true, false);
            expect(customReader.outputDir).to.equal(customTmpDir.name);
            expect(customReader.debugMode).to.be.true;
            expect(customReader.allowOverwrite).to.be.false;
            customTmpDir.removeCallback();
        });

        it('should initialize counters to zero', () => {
            expect(reader.counters).to.deep.equal({
                emails: 0,
                contacts: 0,
                appointments: 0,
                tasks: 0,
                notes: 0,
                groups: 0
            });
        });

        it('should create output directory structure when outputDir is provided', () => {
            const folders = ['emails', 'contacts', 'appointments', 'tasks', 'notes', 'groups', 'categories'];
            folders.forEach(folder => {
                const folderPath = path.join(tmpDir.name, folder);
                expect(fs.existsSync(folderPath)).to.be.true;
            });
        });
    });

    describe('Callback Management', () => {
        it('should set and store callbacks correctly', () => {
            const mockCallback = sinon.stub();
            reader.setCallback('email', mockCallback);
            expect(reader.callbacks.email).to.equal(mockCallback);
        });

        it('should allow multiple callback types', () => {
            const emailCallback = sinon.stub();
            const contactCallback = sinon.stub();
            
            reader.setCallback('email', emailCallback);
            reader.setCallback('contact', contactCallback);
            
            expect(reader.callbacks.email).to.equal(emailCallback);
            expect(reader.callbacks.contact).to.equal(contactCallback);
        });
    });

    describe('Multi-disk Archive Detection', () => {
        let testDir;

        beforeEach(() => {
            testDir = tmp.dirSync({ unsafeCleanup: true });
        });

        afterEach(() => {
            if (testDir) {
                testDir.removeCallback();
            }
        });

        it('should detect multi-disk archives', () => {
            const olmFile = path.join(testDir.name, 'archive.olm');
            const z01File = path.join(testDir.name, 'archive.z01');
            const z02File = path.join(testDir.name, 'archive.z02');
            
            // Create mock files
            fs.writeFileSync(olmFile, 'mock olm');
            fs.writeFileSync(z01File, 'mock z01');
            fs.writeFileSync(z02File, 'mock z02');
            
            expect(reader.isMultiDiskArchive(olmFile)).to.be.true;
        });

        it('should return false for single-disk archives', () => {
            const olmFile = path.join(testDir.name, 'single.olm');
            fs.writeFileSync(olmFile, 'mock single olm');
            
            expect(reader.isMultiDiskArchive(olmFile)).to.be.false;
        });

        it('should handle missing directory gracefully', () => {
            const nonExistentFile = '/nonexistent/path/archive.olm';
            expect(reader.isMultiDiskArchive(nonExistentFile)).to.be.false;
        });
    });

    describe('File Writing', () => {
        it('should write files to correct subdirectories', () => {
            const content = 'test content';
            const filename = 'test.txt';
            const subfolder = 'emails';
            
            reader.writeToFile(filename, content, subfolder);
            
            const filePath = path.join(tmpDir.name, subfolder, filename);
            expect(fs.existsSync(filePath)).to.be.true;
            expect(fs.readFileSync(filePath, 'utf8')).to.equal(content);
        });

        it('should skip writing when no output directory is set', () => {
            const noOutputReader = new OLMReader();
            const spy = sinon.spy(fs, 'writeFileSync');
            
            noOutputReader.writeToFile('test.txt', 'content');
            
            expect(spy.called).to.be.false;
            spy.restore();
        });

        it('should respect allowOverwrite setting', () => {
            const restrictiveReader = new OLMReader(tmpDir.name, false, false);
            const filename = 'existing.txt';
            const filePath = path.join(tmpDir.name, filename);
            
            // Create existing file
            fs.writeFileSync(filePath, 'original content');
            
            // Try to overwrite
            restrictiveReader.writeToFile(filename, 'new content');
            
            // Should still have original content
            expect(fs.readFileSync(filePath, 'utf8')).to.equal('original content');
        });
    });

    describe('Email Processing', () => {
        it('should generate valid EML content with basic email data', async () => {
            const emailData = {
                subject: 'Test Subject',
                fromAddress: 'sender@example.com',
                fromName: 'Test Sender',
                toAddress: 'recipient@example.com',
                toName: 'Test Recipient',
                sentTime: '2024-01-01T10:00:00Z',
                messageId: 'test-message-id',
                textBody: 'This is a test email body.'
            };

            const eml = await reader.generateEMLContent(emailData);
            
            expect(eml).to.include('Subject: Test Subject');
            expect(eml).to.include('sender@example.com');
            expect(eml).to.include('recipient@example.com');
            expect(eml).to.include('This is a test email body.');
        });

        it('should handle missing email fields gracefully', async () => {
            const minimalEmailData = {
                subject: '',
                fromAddress: '',
                toAddress: '',
                textBody: ''
            };

            const eml = await reader.generateEMLContent(minimalEmailData);
            
            expect(eml).to.include('Subject: (No Subject)');
            expect(eml).to.include('[This message has no content]');
        });

        it('should clean subject lines properly', () => {
            const longSubject = 'A'.repeat(300);
            const cleaned = reader.cleanSubject(longSubject);
            expect(cleaned.length).to.be.at.most(200);
        });

        it('should clean email addresses properly', () => {
            // Test Exchange DN format
            const exchangeDN = '/O=COMPANY/OU=GROUP/CN=RECIPIENTS/CN=testuser';
            const cleaned = reader.cleanEmailAddress(exchangeDN);
            expect(cleaned).to.include('@');

            // Test normal email
            const normalEmail = 'test@example.com';
            expect(reader.cleanEmailAddress(normalEmail)).to.equal('test@example.com');

            // Test malformed email
            const malformed = '<"test@example.com">';
            expect(reader.cleanEmailAddress(malformed)).to.equal('test@example.com');
        });
    });

    describe('VCF Generation', () => {
        it('should generate valid VCF content from contact data', () => {
            const contactData = {
                OPFContactCopyFirstName: { '#text': 'John' },
                OPFContactCopyLastName: { '#text': 'Doe' },
                OPFContactCopyDisplayName: { '#text': 'John Doe' },
                OPFContactCopyBusinessCompany: { '#text': 'ACME Corp' },
                OPFContactCopyBusinessTitle: { '#text': 'Manager' },
                OPFContactCopyDefaultEmailAddress: {
                    contactEmailAddress: {
                        OPFContactEmailAddressAddress: 'john.doe@acme.com'
                    }
                }
            };

            const vcf = reader.generateVCFContent(contactData);
            
            expect(vcf).to.include('BEGIN:VCARD');
            expect(vcf).to.include('VERSION:3.0');
            expect(vcf).to.include('FN:John Doe');
            expect(vcf).to.include('N:Doe;John;;;');
            expect(vcf).to.include('ORG:ACME Corp');
            expect(vcf).to.include('TITLE:Manager');
            expect(vcf).to.include('EMAIL:john.doe@acme.com');
            expect(vcf).to.include('END:VCARD');
        });

        it('should handle minimal contact data', () => {
            const minimalContact = {};
            const vcf = reader.generateVCFContent(minimalContact);
            
            expect(vcf).to.include('BEGIN:VCARD');
            expect(vcf).to.include('END:VCARD');
        });
    });

    describe('ICS Generation', () => {
        it('should generate valid ICS content from appointment data', () => {
            const appointmentData = {
                OPFCalendarEventCopySummary: { '#text': 'Meeting with Client' },
                OPFCalendarEventCopyDescriptionPlain: { '#text': 'Discuss project requirements' },
                OPFCalendarEventCopyLocation: { '#text': 'Conference Room A' },
                OPFCalendarEventCopyUUID: { '#text': 'test-uuid-123' },
                OPFCalendarEventCopyStartTime: { '#text': '2024-01-01T10:00:00Z' },
                OPFCalendarEventCopyEndTime: { '#text': '2024-01-01T11:00:00Z' },
                OPFCalendarEventCopyModDate: { '#text': '2024-01-01T09:00:00Z' }
            };

            const ics = reader.generateICSContent(appointmentData);
            
            expect(ics).to.include('BEGIN:VCALENDAR');
            expect(ics).to.include('VERSION:2.0');
            expect(ics).to.include('BEGIN:VEVENT');
            expect(ics).to.include('SUMMARY:Meeting with Client');
            expect(ics).to.include('DESCRIPTION:Discuss project requirements');
            expect(ics).to.include('LOCATION:Conference Room A');
            expect(ics).to.include('UID:test-uuid-123');
            expect(ics).to.include('END:VEVENT');
            expect(ics).to.include('END:VCALENDAR');
        });
    });

    describe('Content Generation', () => {
        it('should generate task content correctly', () => {
            const taskData = {
                OPFTaskCopyName: { '#text': 'Complete Project' },
                OPFTaskCopyNotePlain: { '#text': 'Remember to review all documents' },
                OPFTaskGetPriority: { '#text': 'High' },
                OPFTaskCopyDueDateTime: { '#text': '2024-01-15T17:00:00Z' }
            };

            const content = reader.generateTaskContent(taskData);
            
            expect(content).to.include('Task: Complete Project');
            expect(content).to.include('Priority: High');
            expect(content).to.include('Notes:');
            expect(content).to.include('Remember to review all documents');
        });

        it('should generate note content correctly', () => {
            const noteData = {
                OPFNoteCopyTitle: { '#text': 'Important Note' },
                OPFNoteCopyText: { '#text': 'This is the note content' },
                OPFNoteCopyCreationDate: { '#text': '2024-01-01T10:00:00Z' },
                OPFNoteCopyModDate: { '#text': '2024-01-01T11:00:00Z' }
            };

            const content = reader.generateNoteContent(noteData);
            
            expect(content).to.include('Title: Important Note');
            expect(content).to.include('This is the note content');
            expect(content).to.include('Created:');
            expect(content).to.include('Modified:');
        });
    });

    describe('HTML Processing', () => {
        it('should strip HTML tags correctly', () => {
            const html = '<p>This is <strong>bold</strong> text with <a href="#">links</a>.</p>';
            const text = reader.stripHtml(html);
            
            expect(text).to.equal('This is bold text with links.');
        });

        it('should convert HTML structure to readable text', () => {
            const html = `
                <h1>Title</h1>
                <p>First paragraph</p>
                <p>Second paragraph</p>
                <ul>
                    <li>Item 1</li>
                    <li>Item 2</li>
                </ul>
            `;
            
            const text = reader.stripHtml(html);
            
            expect(text).to.include('Title');
            expect(text).to.include('First paragraph');
            expect(text).to.include('Second paragraph');
            expect(text).to.include('• Item 1');
            expect(text).to.include('• Item 2');
        });

        it('should handle HTML entities correctly', () => {
            const html = 'This &amp; that &lt;test&gt; &quot;quoted&quot; text';
            const text = reader.stripHtml(html);
            
            expect(text).to.equal('This & that <test> "quoted" text');
        });
    });

    describe('Date Formatting', () => {
        it('should format ICS dates correctly', () => {
            const date = new Date('2024-01-01T10:30:00.000Z');
            const formatted = reader.formatICSDate(date);
            
            expect(formatted).to.match(/^\d{8}T\d{6}Z$/);
            expect(formatted).to.equal('20240101T103000Z');
        });

        it('should format RFC2822 dates correctly', () => {
            const dateString = '2024-01-01T10:30:00Z';
            const formatted = reader.formatRFC2822Date(dateString);
            
            expect(formatted).to.include('2024');
            expect(formatted).to.include('GMT');
        });

        it('should handle invalid dates gracefully', () => {
            const invalidDate = 'not-a-date';
            const formatted = reader.formatRFC2822Date(invalidDate);
            
            expect(formatted).to.be.a('string');
            expect(formatted).to.include('GMT');
        });
    });

    describe('Debug Mode', () => {
        it('should output debug messages when debug mode is enabled', () => {
            const debugReader = new OLMReader(null, true);
            const consoleSpy = sinon.spy(console, 'log');
            
            debugReader.debug('Test debug message');
            
            expect(consoleSpy.calledWith('DEBUG: Test debug message')).to.be.true;
            consoleSpy.restore();
        });

        it('should not output debug messages when debug mode is disabled', () => {
            const consoleSpy = sinon.spy(console, 'log');
            
            reader.debug('Test debug message');
            
            expect(consoleSpy.called).to.be.false;
            consoleSpy.restore();
        });
    });
});