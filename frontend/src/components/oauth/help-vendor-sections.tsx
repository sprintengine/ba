import { HelpNote, MenuPath, type HelpSection } from "./help-article";

const CLAUDE_DOCS = "https://claude.com/docs/connectors/custom/add-unlisted";
const OPENAI_DOCS = "https://developers.openai.com/apps-sdk/deploy/connect-chatgpt";

export const claudeSection: HelpSection = {
  id: "claude",
  title: "Claude",
  body: (
    <>
      <p>
        Connectors are shared across claude.ai, Claude Desktop and the Claude mobile apps, so you only need to
        add bookanything once.
      </p>

      <h3>Free, Pro and Max plans</h3>
      <ol>
        <li>
          In Claude, go to <MenuPath>Customize › Connectors</MenuPath>.
        </li>
        <li>
          Click <MenuPath>Add custom connector</MenuPath>.
        </li>
        <li>Enter your server URL (above).</li>
        <li>
          You don&apos;t need an OAuth client ID or secret: leave those fields empty. bookanything supports
          Claude&apos;s published identity and automatic registration.
        </li>
        <li>
          Click <MenuPath>Add</MenuPath>.
        </li>
        <li>
          Click <MenuPath>Connect</MenuPath> (or sign in) when asked, then approve on the bookanything page.
        </li>
      </ol>
      <p>The Free plan allows one custom connector.</p>

      <h3>Team and Enterprise plans</h3>
      <ol>
        <li>
          An Owner adds it once for the organisation: in{" "}
          <MenuPath>Organization settings › Connectors</MenuPath>, click <MenuPath>Add</MenuPath>, then{" "}
          <MenuPath>Custom</MenuPath> (choose <MenuPath>Web</MenuPath> if asked) and enter the server URL.
        </li>
        <li>
          Each member then goes to <MenuPath>Customize › Connectors</MenuPath>, finds bookanything with the
          &ldquo;Custom&rdquo; label and clicks <MenuPath>Connect</MenuPath>, then approves on the
          bookanything page.
        </li>
      </ol>

      <h3>Use it in a chat</h3>
      <p>
        Turn bookanything on for a conversation with the <MenuPath>+</MenuPath> button ›{" "}
        <MenuPath>Connectors</MenuPath>.
      </p>
      <HelpNote>
        Claude&apos;s menus can change. If something looks different, see Anthropic&apos;s guide to{" "}
        <a href={CLAUDE_DOCS} target="_blank" rel="noopener noreferrer">
          adding a custom connector
        </a>
        .
      </HelpNote>
    </>
  ),
};

export const chatgptSection: HelpSection = {
  id: "chatgpt",
  title: "ChatGPT",
  body: (
    <>
      <ol>
        <li>
          Turn on Developer mode in <MenuPath>Settings › Security and login › Developer mode</MenuPath>.
          Whether you can depends on your plan and, in a workspace, on your admin&apos;s settings.
        </li>
        <li>
          Open{" "}
          <a href="https://chatgpt.com/plugins" target="_blank" rel="noopener noreferrer">
            ChatGPT Plugins
          </a>{" "}
          and select the <MenuPath>+</MenuPath> button.
        </li>
        <li>Enter a name (for example &ldquo;bookanything&rdquo;) and a short description.</li>
        <li>
          Under <MenuPath>Connection</MenuPath>, choose a public endpoint and enter your server URL (above).
        </li>
        <li>Create it, then sign in and approve on the bookanything page.</li>
        <li>In a new conversation, add bookanything from the tools menu.</li>
      </ol>
      <HelpNote tone="warning">
        OpenAI changes these menus often, and actions that change things (such as booking) may depend on your
        plan. If something looks different, see OpenAI&apos;s guide to{" "}
        <a href={OPENAI_DOCS} target="_blank" rel="noopener noreferrer">
          connecting an app to ChatGPT
        </a>
        .
      </HelpNote>
    </>
  ),
};

export const otherAssistantsSection: HelpSection = {
  id: "other-assistants",
  title: "Other assistants",
  body: (
    <p>
      Any assistant that supports remote MCP servers with OAuth sign-in can use bookanything. Add your server
      URL where it asks for one; it will open the bookanything sign-in and approval page for you.
    </p>
  ),
};
