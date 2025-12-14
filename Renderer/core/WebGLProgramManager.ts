
export class WebGLProgramManager {
    static createProgram(gl: WebGLRenderingContext | WebGL2RenderingContext, vertexShaderSource: string, fragmentShaderSource: string): WebGLProgram | null {
        const vertexShader = WebGLProgramManager.compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = WebGLProgramManager.compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

        if (!vertexShader || !fragmentShader) return null;

        const program = gl.createProgram();
        if (!program) return null;

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        const success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (!success) {
            console.error('WebGL Program Link Error:', gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }

        return program;
    }

    static compileShader(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
        const shader = gl.createShader(type);
        if (!shader) return null;

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (!success) {
            console.error('WebGL Shader Compile Error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    static getTerrainVertexShader(): string {
        return `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;

            uniform vec2 u_resolution;

            varying vec2 v_texCoord;

            void main() {
                // Convert pixels to 0.0->1.0
                vec2 zeroToOne = a_position / u_resolution;
                
                // Convert 0->1 to 0->2
                vec2 zeroToTwo = zeroToOne * 2.0;
                
                // Convert 0->2 to -1->+1 (clip space)
                vec2 clipSpace = zeroToTwo - 1.0;
                
                // Flip Y axis (canvas vs webgl coords)
                gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
                
                v_texCoord = a_texCoord;
            }
        `;
    }

    static getTerrainFragmentShader(): string {
        return `
            precision mediump float;

            varying vec2 v_texCoord;
            uniform sampler2D u_texture;

            void main() {
                gl_FragColor = texture2D(u_texture, v_texCoord);
                
                // Discard fully transparent pixels to keep depth buffer clean if used, 
                // though for 2D batching painter's algorithm is usually relied upon.
                if (gl_FragColor.a < 0.01) discard;
            }
        `;
    }
}
