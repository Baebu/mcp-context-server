# Context Savvy MCP 🧠✨

_The AI assistant's best friend - because even Claude needs a good memory_

## The Problem That Wouldn't Go Away

You know that feeling when you're deep in a coding session with Claude, everything's flowing perfectly, and then... 💥 Context limit hit. Your conversation gets truncated. The AI forgets what you were working on. All that beautiful, collaborative momentum? Gone.

Or maybe you're the type who switches between projects constantly (guilty 🙋‍♂️), and every time you start a new chat, you have to re-explain your entire setup, your file structure, your preferences, your... everything.

**What if your AI assistant could remember?** Not just remember, but truly _understand_ your projects, maintain context across conversations, and actually _help_ you stay organized?

That's exactly why this exists.

## What This Thing Actually Does

Context Savvy MCP is a turbocharged memory system for Claude Desktop that turns your AI assistant into something that feels almost... permanent. Instead of starting from scratch every conversation, Claude can:

- **Remember everything** across chat sessions (your projects, preferences, ongoing work)
- **Execute commands safely** (because sometimes you need to actually _do_ things, not just talk about them)
- **Manage files intelligently** (read, write, search, organize - all with context awareness)
- **Learn from your patterns** (it gets smarter about how you work over time)
- **Keep itself organized** (autonomous maintenance, cleanup, optimization)

Think of it as giving Claude a persistent workspace and a really, really good memory.

## The Magic in Action 🎩

**Scenario 1: Project Continuity**

```
You (in Chat #1): "Help me refactor this React component..."
[Work gets done, chat ends naturally]

You (in Chat #47, two weeks later): "Hey, what was I working on?"
Claude: "You were refactoring the UserProfile component.
You'd gotten the props interface done and were working on the state management.
Should we continue where we left off?"
```

**Scenario 2: Context-Aware File Operations**

```
You: "Find all the TODO comments in my project"
Claude: [Searches across your entire codebase] "Found 23 TODOs.
The urgent ones are in auth.ts and database.service.ts.
Want me to show you those first?"

You: "Fix the auth one"
Claude: [Opens file, understands context, makes intelligent suggestions]
"I see the issue - you're missing error handling in the token validation. Here's a fix..."
```

**Scenario 3: Learning Your Workflow**

```
After a few weeks of use...

Claude: "I noticed you always run tests after refactoring. Should I go ahead and run them now?"
You: "Yes! And check the coverage while you're at it."
Claude: [Executes tests, analyzes coverage, provides detailed report]
"All green! Coverage increased by 2.3%. The new code is well-tested."
```

## Why This Exists (The Real Story)

I got tired of explaining my setup to Claude every. single. time.

I'm a developer who juggles multiple projects, has strong opinions about code organization, and relies heavily on AI assistance for the tedious stuff. But every new conversation meant starting over - re-explaining my file structure, my preferences, my coding standards, what I was working on.

So I built this. Initially just for me, with too much coffee and stubborn determination.

Turns out, having an AI assistant with persistent memory and the ability to actually _do_ things (not just suggest them) changes everything. Conversations flow naturally. Work gets done faster. Context never gets lost.

**The honest truth:** This started as a personal tool and grew into something that might actually be useful to other developers. It works well for me, but I'm curious if it resonates with anyone else.

## Quick Reality Check ✋

**What definitely works:**

- Persistent context across Claude conversations
- Safe command execution with security boundaries
- Intelligent file operations and project management
- Task tracking and workflow automation
- Most of the daily-use features I depend on

**What might be quirky:**

- The autonomous monitoring (new, needs more testing)
- Complex task workflows (works, but UX could be better)
- Performance with massive projects (it's good, but not tested at enterprise scale)
- Setup process (functional, but could be smoother)

**What I'm genuinely curious about:**

- Is this actually useful to other developers?
- Are there better patterns I should be using?
- Should this be one big server or split into smaller focused ones?
- What features are missing that would make this indispensable?

## Getting Started (The Actually Quick Version)

**Prerequisites:** Node.js 18+, Claude Desktop, and 5 minutes

```bash
# Clone and setup
git clone https://github.com/Baebu/context-savvy-mcp.git
cd context-savvy-mcp
npm install

# One-command setup (handles everything)
npm run quick-setup
```

The setup script will:

- Build the project ⚙️
- Create example configurations 📝
- Run tests to make sure everything works ✅
- Show you exactly what to add to Claude Desktop 📋

**Add to Claude Desktop config:**

```json
{
  "mcpServers": {
    "context-server": {
      "command": "node",
      "args": ["/path/to/your/context-savvy-mcp/dist/index.js"],
      "env": {
        "MCP_SERVER_CONFIG_PATH": "/path/to/your/context-savvy-mcp/config/server.yaml"
      }
    }
  }
}
```

Restart Claude Desktop, and you're off to the races.

## What You Can Do With It

### Memory & Context

- **Store anything:** Project notes, decisions, preferences, todo lists
- **Smart search:** Natural language queries across all your stored context
- **Relationship mapping:** Connect related ideas, files, and projects automatically
- **Learning:** The system gets better at understanding your work patterns

### File & Project Management

- **Intelligent reading:** Handles large files, multiple formats, smart truncation
- **Context-aware editing:** Find/replace with understanding of your code patterns
- **Project analysis:** Comprehensive overviews with actionable insights
- **Workspace organization:** Multiple project support with smart switching

### Secure Automation

- **Safe command execution:** Whitelist-based security with path restrictions
- **Process management:** Monitor and control background tasks
- **System health:** Real-time performance monitoring and optimization
- **Backup management:** Automatic file versioning and recovery

### Task & Workflow Management

- **Smart task creation:** Context-aware task tracking with automatic tagging
- **Workflow automation:** Learn and automate your common patterns
- **Progress tracking:** Persistent task state across conversations
- **Template system:** Reusable workflows for common project types

## The Architecture (For Fellow Code Nerds)

Built with clean architecture principles because I have opinions about code organization:

```
src/
├── core/           # Pure business logic, no dependencies
├── application/    # Use cases, services, workflows
├── infrastructure/ # Database, file system, external APIs
└── presentation/   # MCP protocol interface
```

**Tech stack:** TypeScript, SQLite, TensorFlow.js (for embeddings), Dependency Injection, way too much attention to detail.

**Design philosophy:** Make it work first, make it elegant second, make it fast third. Currently somewhere between steps 2 and 3.

## Security (Because I'm Paranoid)

- **Command whitelisting:** Only approved commands can run
- **Path sandboxing:** File operations restricted to safe zones
- **Input validation:** Everything gets cleaned and checked
- **Audit logging:** Track what happens and when
- **User consent:** Potentially risky operations require confirmation

The default config is locked down tight. You explicitly allow what you want.

## Want to Help? 🤝

**I'm genuinely looking for:**

- **Testing:** Try it with your projects, break it, tell me what happens
- **Code review:** I have blind spots, you probably see them
- **Ideas:** What features would make this indispensable for you?
- **Documentation:** If something doesn't make sense, let me know
- **Real-world feedback:** Does this actually solve problems you have?

**Good first contributions:**

- Try the setup process and document any friction
- Test with different project types and report what works/doesn't
- Add support for your favorite tools or languages
- Improve error messages and UX
- Write tests for edge cases I missed

**To contribute:**

```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/context-savvy-mcp.git
cd context-savvy-mcp
npm install
npm test    # Make sure everything works
npm run dev # Start hacking
```

## Configuration & Customization

The system is controlled by `config/server.yaml`. Here's what you can tune:

```yaml
# Security boundaries
security:
  allowedCommands: ['ls', 'git', 'npm', 'node']
  safezones: ['./projects', './workspace']

# Database and storage
database:
  path: './data/context.db'
  backupInterval: '0 */6 * * *' # Every 6 hours

# AI and learning
embedding:
  model: 'universal-sentence-encoder'
  dimensions: 512

# Autonomous behaviors
autonomous:
  enabled: true
  compressionThreshold: 150000 # tokens
  maintenanceSchedule: '0 2 * * *' # 2 AM daily
```

Run `npm run config` for a web-based configuration UI.

## Performance & Scaling

**Tested with:**

- Projects up to 10,000 files
- Context databases up to 1GB
- Concurrent conversations (works, but not heavily tested)
- Long-running sessions (months of continuous use)

**Optimization features:**

- Intelligent compression and archiving
- Semantic deduplication
- Background maintenance
- Connection pooling and caching

## The Honest FAQ

**Q: Is this production-ready?**  
A: For personal use? Absolutely. For enterprise? Probably needs more testing and hardening.

**Q: Why not use [existing solution]?**  
A: I tried. Nothing gave me the exact combination of persistence, security, and workflow integration I wanted.

**Q: Will this slow down Claude?**  
A: In my experience, no. The context loading is fast, and having persistent memory actually makes conversations more efficient.

**Q: What if I find bugs?**  
A: Please report them! I use this daily, so bugs get fixed quickly.

**Q: Can I use this for commercial projects?**  
A: MIT license, so yes. Just don't blame me if something breaks.

## What's Next

**Near-term roadmap:**

- Better onboarding and setup experience
- More intelligent autonomous behaviors
- Plugin system for custom tools
- Improved performance monitoring
- Better mobile/web interface options

**Longer-term possibilities:**

- Multi-user support
- Cloud synchronization
- Advanced workflow automation
- Integration with more development tools
- AI model fine-tuning on your patterns

## Support & Community

- 📖 **Docs:** [Installation Guide](./INSTALLATION.md) • [Configuration](./CLAUDE_DESKTOP_CONFIG.md)
- 🐛 **Issues:** [Report bugs and request features](https://github.com/Baebu/context-savvy-mcp/issues)
- 💬 **Discussions:** [Share ideas and get help](https://github.com/Baebu/context-savvy-mcp/discussions)
- 📧 **Direct:** Open an issue if you need help or want to chat

## 💙 Support This Project

This project is a labor of love, built with too much coffee and stubborn determination. If Context Savvy MCP makes your AI interactions better, consider supporting its development:

- ☕ **[Buy me a coffee on Ko-fi](https://ko-fi.com/baecentric)** - Keep the caffeine-fueled coding sessions going
- ⭐ **Star the repository** - It genuinely motivates continued development
- 🐛 **Report bugs** - Help make it better for everyone
- 💡 **Share ideas** - Your feedback shapes the roadmap
- 🤝 **Contribute code** - Join the development effort

Every cup of coffee, every star, every contribution helps keep this project alive and growing. **Thank you for being part of the journey!**

## License & Acknowledgments

MIT License - do whatever you want with it.

**Built on the shoulders of:**

- [Model Context Protocol](https://modelcontextprotocol.io/) - The foundation that makes this possible
- [Anthropic](https://www.anthropic.com/) - For Claude and the ecosystem
- [Claude Desktop community](https://discord.gg/anthropic) - For inspiration and feedback
- Excessive amounts of coffee ☕ - For making late-night coding sessions bearable

---

**Made with ❤️ and stubborn determination**

_If this makes your AI interactions even 10% better, it was worth building._
