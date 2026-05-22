/**
 * Babel plugin that replaces dynamic import() expressions containing
 * /* webpackIgnore: true *\/ comments with Promise.resolve({}).
 *
 * This prevents Hermes from choking on raw import() calls that
 * were meant for webpack to ignore (e.g. @supabase/postgrest-js's
 * optional OpenTelemetry import).
 */
module.exports = function () {
  return {
    visitor: {
      CallExpression(path) {
        const { node } = path;
        
        // Check if this is a dynamic import() expression
        if (node.callee.type !== "Import") return;

        // Collect all comments from all relevant nodes
        const commentNodes = [node.callee, node, ...(node.arguments || [])];
        let hasWebpackIgnore = false;

        // Check node comments
        for (const target of commentNodes) {
          if (!target) continue;
          const comments = [
            ...(target.leadingComments || []),
            ...(target.trailingComments || []),
            ...(target.innerComments || []),
          ];
          if (comments.some(c => c.value.includes("webpackIgnore") || c.value.includes("webpack-ignore"))) {
            hasWebpackIgnore = true;
            break;
          }
        }

        // Also check the entire file's comments in case they're attached to program
        if (!hasWebpackIgnore && path.hub && path.hub.file && path.hub.file.ast) {
          const fileComments = path.hub.file.ast.comments || [];
          const nodeStart = node.start;
          const nodeEnd = node.end;
          
          for (const comment of fileComments) {
            // Check if comment is near this import() call
            if (comment.start != null && comment.end != null) {
              const isNear = (nodeStart != null && nodeEnd != null) &&
                            comment.start <= nodeEnd + 50 &&
                            comment.end >= nodeStart - 50;
              if (isNear && (comment.value.includes("webpackIgnore") || comment.value.includes("webpack-ignore"))) {
                hasWebpackIgnore = true;
                break;
              }
            }
          }
        }

        if (!hasWebpackIgnore) return;

        // Replace the entire import() expression with Promise.resolve({})
        path.replaceWithSourceString("Promise.resolve({})");
      },
    },
  };
};