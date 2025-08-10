<?php
date_default_timezone_set('UTC');

function formatDate($t) {
	return date('j M Y',$t);
}

function formatDateTime($t) {
	return formatDate($t)." à ".date('H:i',$t);
}

/**
 * Get the correct entries directory path (dev or prod environment)
 * Now unified: always use 'entries' directory in webroot
 */
function getEntriesPath() {
    // Always use the same path - Docker volumes handle the mapping
    $path = realpath('entries');
    
    if ($path && is_dir($path)) {
        return $path;
    }
    
    // Fallback: create entries directory in current location
    // This should rarely happen as Docker creates the directories
    if (!is_dir('entries')) {
        mkdir('entries', 0755, true);
        // Set proper ownership if running as root (Docker context)
        if (function_exists('posix_getuid') && posix_getuid() === 0) {
            chown('entries', 'www-data');
            chgrp('entries', 'www-data');
        }
    }
    return realpath('entries');
}

/**
 * Get the correct attachments directory path (dev or prod environment)
 * Now unified: always use 'attachments' directory in webroot
 */
function getAttachmentsPath() {
    // Always use the same path - Docker volumes handle the mapping
    $path = realpath('attachments');
    
    if ($path && is_dir($path)) {
        return $path;
    }
    
    // Fallback: create attachments directory in current location
    // This should rarely happen as Docker creates the directories
    if (!is_dir('attachments')) {
        if (!mkdir('attachments', 0777, true)) {
            error_log("Failed to create attachments directory");
            return false;
        }
        
        // Set proper permissions
        chmod('attachments', 0777);
        
        // Set proper ownership if running as root (Docker context)
        if (function_exists('posix_getuid') && posix_getuid() === 0) {
            chown('attachments', 'www-data');
            chgrp('attachments', 'www-data');
        }
        
        error_log("Created attachments directory: " . realpath('attachments'));
    }
    return realpath('attachments');
}

/**
 * Get the relative path for entries (for file operations)
 * Now unified: always use 'entries/' 
 */
function getEntriesRelativePath() {
    return 'entries/';
}

/**
 * Get the relative path for attachments (for file operations)
 * Now unified: always use 'attachments/'
 */
function getAttachmentsRelativePath() {
    return 'attachments/';
}

/**
 * Create demo notes when no notes exist
 * Returns the ID of the first created demo note
 */
function createDemoNote($con) {
    // Create the first demo note (kitchen renovation)
    $demo_heading = "DEMO : Kitchen Renovation Project Ideas";
    $demo_content = "Planning a major home renovation can be both exciting and overwhelming. Here's my current progress on transforming our outdated kitchen into a modern, functional space.

<p><img src=\"https://images.unsplash.com/photo-1484154218962-a197022b5858?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80\" alt=\"Modern kitchen\" style=\"width: 100%; max-width: 500px; border-radius: 8px; margin-bottom: 1rem;\"></p>

<h3>🏠 Kitchen</h3>
<p>Complete kitchen renovation with a <strong>modern</strong> and functional style.</p>

<h4>Priorities:</h4>
<ul>
<li>Replace the <em>old appliances</em></li>
<li>Install a <u>central island</u></li>
<li>Improve the <span style=\"background-color: yellow;\">lighting</span></li>
<li>Choose durable materials</li>
</ul>

<h4>To do this week:</h4>
<ul>
<li>Schedule appointment with architect</li>
<li>Request 3 quotes</li>
<li>Choose wall colors</li>
<li>Select appliances</li>
</ul>

<h3>💰 Budget estimate</h3>
<ol>
<li>Appliances: <code>$12,000</code></li>
<li>Furniture: <code>$18,000</code></li>
<li>Labor: <code>$22,000</code></li>
<li>Miscellaneous: <code>$4,500</code></li>
</ol>

<p><strong>Total estimated:</strong> $56,500</p>

<br><hr><br>

<h4>📞 Useful contacts</h4>
<p>Architect: <a href=\"tel:5551234567\">Sarah Johnson - (555) 123-4567</a><br>
Kitchen Design Co: <a href=\"https://www.kitchendesign.com\">www.kitchendesign.com</a></p>

<p><em>Note: Plan for a minimum of 3 months of work</em></p>";
    
    $demo_tags = "home,renovation,project,kitchen";
    $demo_folder = "Personal Projects";
    
    // Insert the first demo note
    $stmt = $con->prepare("INSERT INTO entries (heading, tags, folder, created, updated) VALUES (?, ?, ?, NOW(), NOW())");
    $stmt->bind_param('sss', $demo_heading, $demo_tags, $demo_folder);
    $stmt->execute();
    $first_demo_note_id = $stmt->insert_id;
    $stmt->close();
    
    // Create the HTML file for the first demo note
    $demo_filename = getEntriesRelativePath() . $first_demo_note_id . ".html";
    file_put_contents($demo_filename, $demo_content);
    
    // Create the second demo note (tech)
    $tech_demo_id = createTechDemoNote($con);
    
    return $first_demo_note_id;
}

/**
 * Create a tech demo note when no notes exist
 * Returns the ID of the created demo note
 */
function createTechDemoNote($con) {
    $demo_heading = "DEMO : Web Development Project Setup";
    $demo_content = "Setting up a new full-stack web application with modern tools and best practices. This project will serve as a foundation for <span style=\"color: red;\">future development work</span>.

<p><img src=\"https://images.unsplash.com/photo-1461749280684-dccba630e2f6?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80\" alt=\"Code on screen\" style=\"width: 100%; max-width: 500px; border-radius: 8px; margin-bottom: 1rem;\"></p>

<h3>💻 Tech Stack</h3>
<p>Building with <strong>modern technologies</strong> for <span style=\"color: red;\">optimal performance</span> and developer experience.</p>

<h4>Frontend:</h4>
<ul>
<li><strong>React 18</strong> with TypeScript</li>
<li><em>Tailwind CSS</em> for styling</li>
<li><u>Vite</u> as build tool</li>
<li>ESLint + Prettier for <span style=\"background-color: yellow;\">code quality</span></li>
</ul>

<h4>Backend:</h4>
<ul>
<li>Node.js with Express</li>
<li><span style=\"color: red;\">PostgreSQL database</span></li>
<li>Prisma ORM</li>
<li>JWT authentication</li>
</ul>

<h3>🚀 Development phases</h3>
<ol>
<li>Project setup and configuration</li>
<li>Database design and models</li>
<li><span style=\"color: red;\">API endpoints development</span></li>
<li>Frontend components and pages</li>
<li>Testing and deployment</li>
</ol>

<h4>Key commands:</h4>
<p><code>npm install</code> - Install dependencies<br>
<code>npm run dev</code> - Start development server<br>
<code>npm run build</code> - Build for production<br>
<code>npm test</code> - Run test suite</p>

<h4>Sample API endpoint:</h4>
<pre>// Express.js route for user authentication
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});
</pre>

<br><hr><br>

<h4>🔗 Resources</h4>
<p>Documentation: <a href=\"https://react.dev\">React Official Docs</a><br>
Repository: <a href=\"https://github.com/user/project\">GitHub Project</a></p>

<p><em>Estimated completion: 6-8 weeks</em></p>";
    
    $demo_tags = "development,web,react,typescript,project";
    $demo_folder = "Development";
    
    // Insert the demo note with favorite = 1
    $stmt = $con->prepare("INSERT INTO entries (heading, tags, folder, favorite, created, updated) VALUES (?, ?, ?, 1, NOW(), NOW())");
    $stmt->bind_param('sss', $demo_heading, $demo_tags, $demo_folder);
    $stmt->execute();
    $demo_note_id = $stmt->insert_id;
    $stmt->close();
    
    // Create the HTML file for the demo note
    $demo_filename = getEntriesRelativePath() . $demo_note_id . ".html";
    file_put_contents($demo_filename, $demo_content);
    
    return $demo_note_id;
}
?>
